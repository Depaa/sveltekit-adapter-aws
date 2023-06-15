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
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { AWSCachingProps, AWSExistingResourcesProps, AWSLambdaAdapterProps } from '../adapter';
import { Architecture, AssetCode, Code, Function, IFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { BucketDeployment, CacheControl, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { ARecord, HostedZone, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import {
  AllowedMethods,
  CacheCookieBehavior,
  CacheHeaderBehavior,
  CachePolicy,
  CacheQueryStringBehavior,
  Distribution,
  HttpVersion,
  IDistribution,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  SSLMethod,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { HttpOrigin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Provider } from 'aws-cdk-lib/custom-resources';
import path from 'path';
import { architectureMapping, runtimeMapping } from './utils';

export interface AWSAdapterStackProps extends StackProps {
  FQDN: string;
  account?: string;
  region?: string;
  serverHandlerPolicies?: PolicyStatement[];
  zoneName?: string;
  lambdaConfig: AWSLambdaAdapterProps;
  existingResources: AWSExistingResourcesProps;
  cacheConfig: AWSCachingProps;
}

export class AWSAdapterStack extends Stack {
  bucket: IBucket;
  serverHandler: IFunction;
  httpApi: IHttpApi;
  hostedZone: IHostedZone;
  certificate: ICertificate;
  distribution: IDistribution;

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

    const architectureString = props.lambdaConfig.architecture ?? 'ARM_64';
    const runtimeString = props.lambdaConfig.runtime ?? 'NODEJS_18_X';
    const runtime =
      runtimeString in runtimeMapping ? runtimeMapping[runtimeString as keyof typeof runtimeMapping] : Runtime.PROVIDED;
    const architecture =
      architectureString in architectureMapping
        ? architectureMapping[architectureString as keyof typeof architectureMapping]
        : Architecture.custom(architectureString);

    this.serverHandler = new Function(this, `${id}-server-function`, {
      code: new AssetCode(serverPath!),
      handler: 'index.handler',
      timeout: Duration.seconds(props.lambdaConfig.timeout ?? 900),
      runtime,
      architecture,
      memorySize: props.lambdaConfig.memorySize ?? 1024,
      logRetention: props.lambdaConfig.logRetentionDays ?? 14,
      environment: {
        ...environment.parsed,
      } as any,
    });

    props.serverHandlerPolicies?.forEach((policy) => this.serverHandler.addToRolePolicy(policy));

    this.httpApi = new HttpApi(this, `${id}-server-api`, {
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

    if (props.existingResources.staticBucketName) {
      this.bucket = Bucket.fromBucketName(this, `${id}-static-content`, props.existingResources.staticBucketName);
    } else {
      this.bucket = new Bucket(this, `${id}-static-content`, {
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });
    }

    const allowHeaders = [
      'Origin',
      'Accept-Charset',
      'Accept',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
      'Referer',
      'Accept-Language',
      'Accept-Datetime',
      'Authorization',
    ];
    const defaultTtl = 31_536_000; //365 days
    const dynamicCacheConfig = props.cacheConfig.distributionDynamic;
    const staticCacheConfig = props.cacheConfig.distributionStatic;

    const dynamicCachePolicy = new CachePolicy(this, `${id}-dynamic-policy`, {
      comment: dynamicCacheConfig?.comment,
      defaultTtl: Duration.seconds(dynamicCacheConfig?.minTtl ?? defaultTtl),
      minTtl: Duration.seconds(dynamicCacheConfig?.minTtl ?? defaultTtl),
      maxTtl: Duration.seconds(dynamicCacheConfig?.maxTtl ?? defaultTtl),
      cookieBehavior: CacheCookieBehavior.all(),
      queryStringBehavior: CacheQueryStringBehavior.all(),
      headerBehavior: CacheHeaderBehavior.allowList(...allowHeaders),
      enableAcceptEncodingBrotli: dynamicCacheConfig?.enableAcceptEncodingBrotli ?? false,
      enableAcceptEncodingGzip: dynamicCacheConfig?.enableAcceptEncodingGzip ?? true,
    });

    const staticCachePolicy = new CachePolicy(this, `${id}-static-policy`, {
      comment: staticCacheConfig?.comment,
      defaultTtl: Duration.seconds(staticCacheConfig?.minTtl ?? defaultTtl),
      minTtl: Duration.seconds(staticCacheConfig?.minTtl ?? defaultTtl),
      maxTtl: Duration.seconds(staticCacheConfig?.maxTtl ?? defaultTtl),
      cookieBehavior: CacheCookieBehavior.none(),
      queryStringBehavior: CacheQueryStringBehavior.none(),
      headerBehavior: CacheHeaderBehavior.none(),
      enableAcceptEncodingBrotli: dynamicCacheConfig?.enableAcceptEncodingBrotli ?? true,
      enableAcceptEncodingGzip: dynamicCacheConfig?.enableAcceptEncodingGzip ?? true,
    });

    if (!props.existingResources.distributionId || !props.existingResources.distributionDomainName) {
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
      this.distribution = this.createDistribution(id, routes, dynamicCachePolicy, staticCachePolicy, process.env.FQDN);
    } else {
      const lambdaEnvironmentVars = {
        DISTRIBUTION_ID: props.existingResources.distributionId,
        DISTRIBUTION_ARN: `arn:aws:cloudfront::${this.account}:distribution/${props.existingResources.distributionId}`,
        DISTRIBUTION_STATIC_ROUTES: JSON.stringify(routes),
        DISTRIBUTION_STATIC_ORIGINS: JSON.stringify([
          { bucketName: this.bucket.bucketName, domainName: this.bucket.bucketDomainName },
        ]),
        DISTRIBUTION_DYNAMIC_ORIGINS: JSON.stringify([{ url: this.httpApi.apiEndpoint, path: '' }]),
        DISTRIBUTION_STATIC_CACHE_POLICY_ID: staticCachePolicy.cachePolicyId,
        DISTRIBUTION_DYNAMIC_CACHE_POLICY_ID: dynamicCachePolicy.cachePolicyId,
      };
      this.distribution = this.updateDistribution(
        id,
        props.existingResources.distributionId,
        props.existingResources.distributionDomainName,
        this.bucket.bucketArn,
        lambdaEnvironmentVars
      );
    }

    new BucketDeployment(this, `${id}-static-deployment`, {
      destinationBucket: this.bucket,
      sources: [Source.asset(staticPath!), Source.asset(prerenderedPath!)],
      retainOnDelete: false,
      prune: true,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      cacheControl: props.cacheConfig.staticAssets
        ? [CacheControl.fromString(props.cacheConfig.staticAssets.cacheControl)]
        : undefined,
    });

    new CfnOutput(this, `${id}-url`, {
      value: process.env.FQDN ? `https://${process.env.FQDN}` : `https://${this.distribution.distributionDomainName}`,
    });

    new CfnOutput(this, 'STACK_NAME', { value: id });

    new CfnOutput(this, `ExportsOutputSSRStaticOrigins`, {
      value: JSON.stringify([{ bucketName: this.bucket.bucketName, domainName: this.bucket.bucketDomainName }]),
      exportName: `${id}-static-origins`,
    });

    new CfnOutput(this, `ExportsOutputSSRStaticRoutes`, {
      value: JSON.stringify(routes),
      exportName: `${id}-static-routes`,
    });

    new CfnOutput(this, `ExportsOutputSSRStaticPolicyId`, {
      value: staticCachePolicy.cachePolicyId,
      exportName: `${id}-static-policy-id`,
    });

    new CfnOutput(this, `ExportsOutputSSRDynamicOrigins`, {
      value: JSON.stringify([{ url: this.httpApi.apiEndpoint, path: '' }]),
      exportName: `${id}-dynamic-origins`,
    });

    new CfnOutput(this, `ExportsOutputSSRDynamicPolicyId`, {
      value: dynamicCachePolicy.cachePolicyId,
      exportName: `${id}-dynamic-policy-id`,
    });
  }

  private createDistribution(
    stackId: string,
    routes: string[],
    dynamicCachePolicy: CachePolicy,
    staticCachePolicy: CachePolicy,
    FQDN?: string
  ): Distribution {
    const distribution = new Distribution(this, `${stackId}-cache`, {
      priceClass: PriceClass.PRICE_CLASS_ALL,
      httpVersion: HttpVersion.HTTP2_AND_3,
      sslSupportMethod: SSLMethod.SNI,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      enabled: true,
      defaultRootObject: '',
      domainNames: FQDN ? [FQDN!] : [],
      certificate: FQDN
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
        cachePolicy: dynamicCachePolicy,
      },
    });

    const s3Origin = new S3Origin(this.bucket);
    routes.forEach((route) => {
      distribution.addBehavior(route, s3Origin, {
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        originRequestPolicy: OriginRequestPolicy.USER_AGENT_REFERER_HEADERS,
        cachePolicy: staticCachePolicy,
      });
    });

    if (FQDN) {
      new ARecord(this, `${stackId}-alias-record`, {
        recordName: FQDN,
        target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
        zone: this.hostedZone,
      });
    }

    return distribution;
  }

  private createCustomResource(
    name: string,
    filePath: string,
    bucketArn: string,
    env?: { [key: string]: string }
  ): CustomResource {
    const customLambda = new Function(this, name, {
      functionName: `${name}`,
      runtime: Runtime.NODEJS_18_X,
      timeout: Duration.seconds(30),
      code: Code.fromAsset(path.join(__dirname, filePath)),
      handler: 'index.handler',
      environment: env ?? {},
    });

    const customPermissions = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'cloudfront:DeleteOriginAccessControl',
        'cloudfront:CreateOriginAccessControl',
        'cloudfront:GetDistribution',
        'cloudfront:GetDistributionConfig',
        'cloudfront:UpdateDistribution',
        's3:GetBucketPolicy',
        's3:PutBucketPolicy',
      ],
      resources: [
        `arn:aws:cloudfront::${this.account}:origin-access-control/*`,
        `arn:aws:cloudfront::${this.account}:distribution/*`,
        bucketArn,
      ],
    });
    customLambda.addToRolePolicy(customPermissions);

    const customResourceProvider = new Provider(this, `${name}-provider`, {
      onEventHandler: customLambda,
    });

    return new CustomResource(this, `${name}-custom-resource`, {
      serviceToken: customResourceProvider.serviceToken,
    });
  }

  private updateDistribution(
    stackId: string,
    distributionId: string,
    domainName: string,
    bucketArn: string,
    env?: { [key: string]: string }
  ): IDistribution {
    this.createCustomResource(
      `${stackId}-update-distribution`,
      './custom-resources/update-distribution',
      bucketArn,
      env ?? {}
    );

    return Distribution.fromDistributionAttributes(this, `${stackId}-cache`, {
      distributionId,
      domainName,
    });
  }
}
