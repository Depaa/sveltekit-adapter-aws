import { Construct } from 'constructs';
import {
  StackProps,
  Stack,
  Fn,
  RemovalPolicy,
  Duration,
  CfnOutput,
  aws_certificatemanager,
  CustomResource,
} from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, IHttpApi, PayloadFormatVersion } from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { config } from 'dotenv';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { AWSCachingProps, AWSCloudFrontProps, AWSLambdaAdapterProps } from '../adapter';
import { AssetCode, Code, Function, IFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { ARecord, HostedZone, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  OriginProtocolPolicy,
  OriginRequestCookieBehavior,
  OriginRequestHeaderBehavior,
  OriginRequestPolicy,
  OriginRequestQueryStringBehavior,
  PriceClass,
  SSLMethod,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { HttpOrigin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Provider } from 'aws-cdk-lib/custom-resources';
import path from 'path';

export interface AWSAdapterStackProps extends StackProps {
  FQDN: string;
  account?: string;
  region?: string;
  serverHandlerPolicies?: PolicyStatement[];
  zoneName?: string;
  lambdaConfig: AWSLambdaAdapterProps;
  cloudfrontConfig: AWSCloudFrontProps;
  cacheConfig: AWSCachingProps;
}

export class AWSAdapterStack extends Stack {
  bucket: IBucket;
  serverHandler: IFunction;
  httpApi: IHttpApi;
  hostedZone: IHostedZone;
  certificate: ICertificate;

  constructor(scope: Construct, id: string, props: AWSAdapterStackProps) {
    super(scope, id, props);

    const routes = process.env.ROUTES?.split(',') || [];
    const projectPath = process.env.PROJECT_PATH;
    const serverPath = process.env.SERVER_PATH;
    const staticPath = process.env.STATIC_PATH;
    const prerenderedPath = process.env.PRERENDERED_PATH;
    const environment = config({ path: projectPath });
    const [_, zoneName, ...MLDs] = process.env.FQDN?.split('.') || [];
    const domainName = [zoneName, ...MLDs].join('.');

    console.log(props.lambdaConfig);
    console.log(props.cloudfrontConfig);
    console.log(props.cacheConfig);

    this.serverHandler = new Function(this, 'LambdaServerFunctionHandler', {
      code: new AssetCode(serverPath!),
      handler: 'index.handler',
      runtime: props.lambdaConfig.runtime || Runtime.NODEJS_18_X,
      timeout: props.lambdaConfig.timeout || Duration.minutes(15),
      memorySize: props.lambdaConfig.memorySize || 1024,
      logRetention: props.lambdaConfig.logRetentionDays || 14,
      environment: {
        ...environment.parsed,
      } as any,
    });

    props.serverHandlerPolicies?.forEach((policy) => this.serverHandler.addToRolePolicy(policy));

    this.httpApi = new HttpApi(this, 'API', {
      corsPreflight: {
        allowHeaders: ['*'],
        allowMethods: [CorsHttpMethod.ANY],
        allowOrigins: ['*'],
        maxAge: Duration.days(1),
      },
      defaultIntegration: new HttpLambdaIntegration('LambdaServerIntegration', this.serverHandler, {
        payloadFormatVersion: PayloadFormatVersion.VERSION_1_0,
      }),
    });

    this.bucket = new Bucket(this, 'StaticContentBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    if (process.env.FQDN) {
      this.hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
        domainName,
      }) as HostedZone;

      this.certificate = new aws_certificatemanager.DnsValidatedCertificate(this, 'DnsValidatedCertificate', {
        domainName: process.env.FQDN!,
        hostedZone: this.hostedZone,
        region: 'us-east-1',
      });
    }

    const distribution = new Distribution(this, 'CloudFrontDistribution', {
      priceClass: PriceClass.PRICE_CLASS_100,
      enabled: true,
      defaultRootObject: '',
      sslSupportMethod: SSLMethod.SNI,
      domainNames: process.env.FQDN ? [process.env.FQDN!] : [],
      certificate: process.env.FQDN
        ? aws_certificatemanager.Certificate.fromCertificateArn(
            this,
            'DomainCertificate',
            this.certificate.certificateArn
          )
        : undefined,
      defaultBehavior: {
        compress: true,
        origin: new HttpOrigin(Fn.select(1, Fn.split('://', this.httpApi.apiEndpoint)), {
          protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        originRequestPolicy: new OriginRequestPolicy(this, 'OriginRequestPolicy', {
          cookieBehavior: OriginRequestCookieBehavior.all(),
          queryStringBehavior: OriginRequestQueryStringBehavior.all(),
          headerBehavior: OriginRequestHeaderBehavior.allowList(
            'Origin',
            'Accept-Charset',
            'Accept',
            'Access-Control-Request-Method',
            'Access-Control-Request-Headers',
            'Referer',
            'Accept-Language',
            'Accept-Datetime'
          ),
        }),
        cachePolicy: CachePolicy.CACHING_DISABLED,
      },
    });

    const s3Origin = new S3Origin(this.bucket, {});
    routes.forEach((route) => {
      distribution.addBehavior(route, s3Origin, {
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        originRequestPolicy: OriginRequestPolicy.USER_AGENT_REFERER_HEADERS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      });
    });

    if (process.env.FQDN) {
      new ARecord(this, 'ARecord', {
        recordName: process.env.FQDN,
        target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
        zone: this.hostedZone,
      });
    }

    new BucketDeployment(this, 'StaticContentDeployment', {
      destinationBucket: this.bucket,
      sources: [Source.asset(staticPath!), Source.asset(prerenderedPath!)],
      retainOnDelete: false,
      prune: true,
      distribution,
      distributionPaths: ['/*'],
    });

    this.createCustomResource('add-static-origin', './custom-resources/add-origins');

    new CfnOutput(this, 'appUrl', {
      value: process.env.FQDN ? `https://${process.env.FQDN}` : `https://${distribution.domainName}`,
    });

    new CfnOutput(this, 'stackName', { value: id });
  }

  private createCustomResource(name: string, filePath: string): CustomResource {
    const customLambda = new Function(this, name, {
      functionName: `${name}`,
      runtime: Runtime.NODEJS_18_X,
      timeout: Duration.seconds(30),
      code: Code.fromAsset(path.join(__dirname, filePath)),
      handler: 'index.handler',
      environment: {},
    });

    const customResourceProvider = new Provider(this, `${name}-provider`, {
      onEventHandler: customLambda,
    });

    return new CustomResource(this, `${name}-custom-resource`, {
      serviceToken: customResourceProvider.serviceToken,
    });
  }
}
