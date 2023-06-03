const response = require('cfn-response')
const { CloudFrontClient, GetDistributionCommand, UpdateDistributionCommand, CreateOriginAccessControlCommand, DeleteOriginAccessControlCommand } = require("@aws-sdk/client-cloudfront");
const { S3Client, GetBucketPolicyCommand, PutBucketPolicyCommand } = require("@aws-sdk/client-s3");

const cloudfrontClient = new CloudFrontClient();
const s3Client = new S3Client();

exports.handler = async (event, context) => {
  console.log(event);

  try {
    const params = {
      Id: process.env.DISTRIBUTION_ID,
    }

    switch (event.RequestType) {
      case 'Create':
        await createResource(event, context, params);
        break;
      case 'Delete':
        await deleteResource(event, context, params);
        break;
      default:
        throw new Error('Event not handled');
    }
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      response.send(event, context, 'FAILED', { message: error.message });
    } else {
      response.send(event, context, 'FAILED', error);
    }
  }
};

const createResource = async (event, context, params) => {
  const getDistributionCommand = new GetDistributionCommand(params);
  const distribution = await cloudfrontClient.send(getDistributionCommand);
  console.log(JSON.stringify(distribution));

  const existingDistributionConfig = distribution.Distribution.DistributionConfig;
  const dynamicOrigins = JSON.parse(process.env.DISTRIBUTION_DYNAMIC_ORIGINS);
  const staticOrigins = JSON.parse(process.env.DISTRIBUTION_STATIC_ORIGINS);

  await addStaticBehaviors(staticOrigins, existingDistributionConfig);
  addDynamicBehaviors(dynamicOrigins, existingDistributionConfig);
  existingDistributionConfig.Origins = removeDuplicateOrigins(existingDistributionConfig.Origins);
  existingDistributionConfig.Origins.Quantity = existingDistributionConfig.Origins.Items.length;
  existingDistributionConfig.CacheBehaviors = removeDuplicateCacheBehaviors(existingDistributionConfig.CacheBehaviors);
  existingDistributionConfig.CacheBehaviors.Quantity = existingDistributionConfig.CacheBehaviors.Items.length;

  const updateDistributionInput = {
    DistributionConfig: existingDistributionConfig,
    Id: process.env.DISTRIBUTION_ID,
    IfMatch: distribution.ETag
  };
  console.log(JSON.stringify(updateDistributionInput));
  const updateDistributionCommand = new UpdateDistributionCommand(updateDistributionInput);
  const updateDistributionResponse = await cloudfrontClient.send(updateDistributionCommand);
  console.log(JSON.stringify(updateDistributionResponse))

  response.send(event, context, 'SUCCESS', {});
};

const deleteResource = async (event, context, params) => {
  const getDistributionCommand = new GetDistributionCommand(params);
  const distribution = await cloudfrontClient.send(getDistributionCommand);
  console.log(JSON.stringify(distribution));

  const existingDistributionConfig = distribution.Distribution.DistributionConfig;
  const dynamicOrigins = JSON.parse(process.env.DISTRIBUTION_DYNAMIC_ORIGINS);
  const staticOrigins = JSON.parse(process.env.DISTRIBUTION_STATIC_ORIGINS);

  const { dynamicOriginsToDelete, dynamicCacheBehaviourToDelete } = findDynamicResourceToRemove(dynamicOrigins);
  const { staticOriginsToDelete, staticCacheBehaviourToDelete } = findStaticResourceToRemove(staticOrigins);
  console.log(dynamicOriginsToDelete);
  console.log(dynamicCacheBehaviourToDelete);
  console.log(staticOriginsToDelete);
  console.log(staticCacheBehaviourToDelete);

  const originsId = [
    ...dynamicOriginsToDelete,
    ...staticOriginsToDelete,
  ]
  console.log(originsId);
  const cacheBehaviorsIds = [
    ...dynamicCacheBehaviourToDelete,
    ...staticCacheBehaviourToDelete,
  ]
  console.log(cacheBehaviorsIds);

  existingDistributionConfig.Origins = removeOriginsByIds(existingDistributionConfig.Origins, originsId);
  existingDistributionConfig.Origins.Quantity = existingDistributionConfig.Origins.Items.length;
  existingDistributionConfig.CacheBehaviors = removeCacheBehaviors(existingDistributionConfig.CacheBehaviors, cacheBehaviorsIds);
  existingDistributionConfig.CacheBehaviors.Quantity = existingDistributionConfig.CacheBehaviors.Items.length;

  console.log(JSON.stringify(existingDistributionConfig));

  const updateDistributionInput = {
    DistributionConfig: existingDistributionConfig,
    Id: process.env.DISTRIBUTION_ID,
    IfMatch: distribution.ETag
  };
  console.log(JSON.stringify(updateDistributionInput));
  const updateDistributionCommand = new UpdateDistributionCommand(updateDistributionInput);
  const updateDistributionResponse = await cloudfrontClient.send(updateDistributionCommand);
  console.log(JSON.stringify(updateDistributionResponse))

  response.send(event, context, 'SUCCESS', {});
};

const removeDuplicateOrigins = (origins) => {
  const uniqueIds = new Set();
  const uniqueOrigins = origins.Items.filter((origin) => {
    if (uniqueIds.has(origin.Id)) {
      return false;
    }
    uniqueIds.add(origin.Id);
    return true;
  });

  origins.Quantity = uniqueOrigins.length;
  origins.Items = uniqueOrigins;

  return origins;
}

const removeDuplicateCacheBehaviors = (cacheBehaviors) => {
  const uniqueCacheBehaviors = [];
  const uniqueCombinations = new Set();

  cacheBehaviors.Items.forEach((behavior) => {
    const combination = `${behavior.PathPattern}-${behavior.TargetOriginId}`;

    if (!uniqueCombinations.has(combination)) {
      uniqueCombinations.add(combination);
      uniqueCacheBehaviors.push(behavior);
    }
  });

  cacheBehaviors.Quantity = uniqueCacheBehaviors.length;
  cacheBehaviors.Items = uniqueCacheBehaviors;

  return cacheBehaviors;
}

const addStaticBehaviors = async (staticOrigins, existingDistributionConfig) => {
  for (let i = 0; i < staticOrigins.length; i++) {
    const statement = {
      Sid: `Allow access from distribution - ${process.env.DISTRIBUTION_ID}`,
      Effect: "Allow",
      Principal: {
        Service: "cloudfront.amazonaws.com"
      },
      Action: "s3:GetObject",
      Resource: `arn:aws:s3:::${staticOrigins[i].bucketName}/*`,
      Condition: {
        StringEquals: {
          "AWS:SourceArn": process.env.DISTRIBUTION_ARN
        }
      }
    };

    const createOACParams = {
      OriginAccessControlConfig: {
        Name: `ssr-static-assets-${i + 1}-${process.env.DISTRIBUTION_ID}}`,
        Description: `OAC for ssr-static-assets-${i + 1}-${new Date().getTime()}`,
        SigningProtocol: "sigv4",
        SigningBehavior: "always",
        OriginAccessControlOriginType: "s3",
      },
    };
    console.log(JSON.stringify(createOACParams));
    const createOACCommand = new CreateOriginAccessControlCommand(createOACParams);
    const OACResult = await cloudfrontClient.send(createOACCommand);
    console.log(JSON.stringify(OACResult));

    existingDistributionConfig.Origins.Items.push({
      Id: staticOrigins[i].domainName,
      DomainName: staticOrigins[i].domainName,
      OriginPath: '',
      CustomHeaders: {
        Quantity: 0,
        Items: []
      },
      S3OriginConfig: {
        OriginAccessIdentity: ''
      },
      ConnectionAttempts: 3,
      ConnectionTimeout: 10,
      OriginShield: {
        Enabled: false
      },
      OriginAccessControlId: OACResult.OriginAccessControl.Id
    });
    const getBucketPolicyParams = {
      Bucket: staticOrigins[i].bucketName
    };
    let bucketPolicy = {};
    try {
      const getBucketPolicyCommand = new GetBucketPolicyCommand(getBucketPolicyParams);
      bucketPolicy = await s3Client.send(getBucketPolicyCommand);
    } catch (error) {
      console.error(error);
      if (error.Code === 'NoSuchBucketPolicy') {
        bucketPolicy = {
          Policy: JSON.stringify({
            Version: "2008-10-17",
            Id: "CloudFrontPolicy",
            Statement: []
          })
        };
      } else {
        throw new Error(error);
      }
    }
    console.log(bucketPolicy);

    const jsonPolicy = JSON.parse(bucketPolicy.Policy);
    jsonPolicy.Statement.push(statement);

    const putBucketPolicyParams = {
      Bucket: staticOrigins[i].bucketName,
      Policy: JSON.stringify(jsonPolicy)
    }
    console.log(putBucketPolicyParams);

    const putBucketPolicyCommand = new PutBucketPolicyCommand(putBucketPolicyParams);
    const putBucketPolicyRes = await s3Client.send(putBucketPolicyCommand);
    console.log(putBucketPolicyRes);

    const staticRoutes = JSON.parse(process.env.DISTRIBUTION_STATIC_ROUTES);
    for (const route of staticRoutes) {
      existingDistributionConfig.CacheBehaviors.Items.push({
        PathPattern: route,
        TargetOriginId: staticOrigins[i].domainName,
        TrustedSigners: {
          Enabled: false,
          Quantity: 0
        },
        TrustedKeyGroups: {
          Enabled: false,
          Quantity: 0
        },
        ViewerProtocolPolicy: "https-only",
        AllowedMethods: {
          Quantity: 3,
          Items: [
            "HEAD",
            "GET",
            "OPTIONS",
          ],
          CachedMethods: {
            Quantity: 3,
            Items: [
              "HEAD",
              "GET",
              "OPTIONS"
            ]
          }
        },
        SmoothStreaming: false,
        Compress: true,
        LambdaFunctionAssociations: {
          Quantity: 0
        },
        FunctionAssociations: {
          Quantity: 0
        },
        FieldLevelEncryptionId: "",
        CachePolicyId: process.env.DISTRIBUTION_STATIC_CACHE_POLICY_ID,
      });
    }
  };
}

const addDynamicBehaviors = (dynamicOrigins, existingDistributionConfig) => {
  for (let i = 0; i < dynamicOrigins.length; i++) {
    existingDistributionConfig.Origins.Items.push({
      Id: dynamicOrigins[i].url.replace(/^https?:\/\//, ''),
      DomainName: dynamicOrigins[i].url.replace(/^https?:\/\//, ''),
      OriginPath: dynamicOrigins[i].path,
      CustomOriginConfig: {
        HTTPPort: 80,
        HTTPSPort: 443,
        OriginProtocolPolicy: 'https-only',
        OriginSslProtocols: {
          Quantity: 1,
          Items: [
            'TLSv1.2'
          ]
        },
        OriginReadTimeout: 30,
        OriginKeepaliveTimeout: 5
      },
      CustomHeaders: {
        Quantity: 0,
        Items: []
      }
    });
    if (!existingDistributionConfig.CacheBehaviors.Quantity) {
      existingDistributionConfig.CacheBehaviors.Items = [];
    }

    existingDistributionConfig.CacheBehaviors.Items.push({
      PathPattern: "/",
      TargetOriginId: dynamicOrigins[i].url.replace(/^https?:\/\//, ''),
      TrustedSigners: {
        Enabled: false,
        Quantity: 0
      },
      TrustedKeyGroups: {
        Enabled: false,
        Quantity: 0
      },
      ViewerProtocolPolicy: "https-only",
      AllowedMethods: {
        Quantity: 7,
        Items: [
          "HEAD",
          "DELETE",
          "POST",
          "GET",
          "OPTIONS",
          "PUT",
          "PATCH"
        ],
        CachedMethods: {
          Quantity: 3,
          Items: [
            "HEAD",
            "GET",
            "OPTIONS"
          ]
        }
      },
      SmoothStreaming: false,
      Compress: true,
      LambdaFunctionAssociations: {
        Quantity: 0
      },
      FunctionAssociations: {
        Quantity: 0
      },
      FieldLevelEncryptionId: "",
      CachePolicyId: process.env.DISTRIBUTION_DYNAMIC_CACHE_POLICY_ID,
    });
  };
}

const findStaticResourceToRemove = (staticOrigins) => {
  const toDelete = {
    staticOriginsToDelete: [],
    staticCacheBehaviourToDelete: [],
  }
  const staticRoutes = JSON.parse(process.env.DISTRIBUTION_STATIC_ROUTES);
  for (let i = 0; i < staticOrigins.length; i++) {
    toDelete.staticOriginsToDelete.push(staticOrigins[i].domainName);

    for (const route of staticRoutes) {
      toDelete.staticCacheBehaviourToDelete.push(`${route}-${staticOrigins[i].domainName.replace(/^https?:\/\//, '')}`);
    }
  }
  return toDelete;
}

const findDynamicResourceToRemove = (dynamicOrigins) => {
  const toDelete = {
    dynamicOriginsToDelete: [],
    dynamicCacheBehaviourToDelete: [],
  }
  for (let i = 0; i < dynamicOrigins.length; i++) {
    toDelete.dynamicOriginsToDelete.push(dynamicOrigins[i].url.replace(/^https?:\/\//, ''));
    toDelete.dynamicCacheBehaviourToDelete.push(`/-${dynamicOrigins[i].url.replace(/^https?:\/\//, '')}`);
  }
  return toDelete;
}

const removeOriginsByIds = (origins, ids) => {
  const filteredOrigins = origins.Items.filter((origin) => {
    return !ids.includes(origin.Id);
  });

  origins.Quantity = filteredOrigins.length;
  origins.Items = filteredOrigins;

  return origins;
}

const removeCacheBehaviors = (cacheBehaviors, ids) => {
  const filteredBehaviors = cacheBehaviors.Items.filter((behavior) => {
    const id = `${behavior.PathPattern}-${behavior.TargetOriginId}`;
    return !ids.includes(id);
  });

  cacheBehaviors.Quantity = filteredBehaviors.length;
  cacheBehaviors.Items = filteredBehaviors;

  return cacheBehaviors;
}
