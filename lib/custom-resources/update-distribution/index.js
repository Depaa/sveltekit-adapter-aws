const response = require('cfn-response')
const { CloudFrontClient, GetDistributionCommand, UpdateDistributionCommand } = require("@aws-sdk/client-cloudfront");

const client = new CloudFrontClient();

exports.handler = async (event, context) => {
  console.log(event);

  /*
  * ENVS:
      DISTRIBUTION_ID: props.existingResources.distributionId,
      DISTRIBUTION_STATIC_ROUTES: JSON.stringify(routes),
      DISTRIBUTION_STATIC_ORIGINS: JSON.stringify([this.bucket.bucketName]),
      DISTRIBUTION_DYNAMIC_ORIGINS: JSON.stringify([this.httpApi.apiEndpoint]),
      DISTRIBUTION_STATIC_CACHE_POLICY_ID: staticCachePolicy.cachePolicyId,
      DISTRIBUTION_DYNAMIC_CACHE_POLICY_ID: dynamicCachePolicy.cachePolicyId
  */
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
  const distribution = await client.send(getDistributionCommand);
  console.log(JSON.stringify(distribution));
  // Extract the existing configuration values
  const existingDistributionConfig = distribution.Distribution.DistributionConfig;

  // Modify the existing distribution configuration as needed
  const dynamicOrigins = JSON.parse(process.env.DISTRIBUTION_DYNAMIC_ORIGINS);
  const staticOrigins = JSON.parse(process.env.DISTRIBUTION_STATIC_ORIGINS);

  for (const [i, origin] of enumerate(dynamicOrigins)) {
    existingDistributionConfig.Origins.Items.push({
      Id: `ssr-dynamic-assets-${i}`,
      DomainName: origin,
      
    });

    existingDistributionConfig.DefaultCacheBehavior = {
      ...existingDistributionConfig.DefaultCacheBehavior,
      TargetOriginId: `ssr-dynamic-assets-${i}`,
      ViewerProtocolPolicy: "redirect-to-https"
    };
  }

  const distributionOutput = { // GetDistributionResult
    Distribution: { // Distribution
      Id: "STRING_VALUE", // required
      ARN: "STRING_VALUE", // required
      Status: "STRING_VALUE", // required
      LastModifiedTime: new Date("TIMESTAMP"), // required
      InProgressInvalidationBatches: Number("int"), // required
      DomainName: "STRING_VALUE", // required
      ActiveTrustedSigners: { // ActiveTrustedSigners
        Enabled: true || false, // required
        Quantity: Number("int"), // required
        Items: [ // SignerList
          { // Signer
            AwsAccountNumber: "STRING_VALUE",
            KeyPairIds: { // KeyPairIds
              Quantity: Number("int"), // required
              Items: [ // KeyPairIdList
                "STRING_VALUE",
              ],
            },
          },
        ],
      },
      ActiveTrustedKeyGroups: { // ActiveTrustedKeyGroups
        Enabled: true || false, // required
        Quantity: Number("int"), // required
        Items: [ // KGKeyPairIdsList
          { // KGKeyPairIds
            KeyGroupId: "STRING_VALUE",
            KeyPairIds: {
              Quantity: Number("int"), // required
              Items: [
                "STRING_VALUE",
              ],
            },
          },
        ],
      },
      DistributionConfig: { // DistributionConfig
        CallerReference: "STRING_VALUE", // required
        Aliases: { // Aliases
          Quantity: Number("int"), // required
          Items: [ // AliasList
            "STRING_VALUE",
          ],
        },
        DefaultRootObject: "STRING_VALUE",
        Origins: { // Origins
          Quantity: Number("int"), // required
          Items: [ // OriginList // required
            { // Origin
              Id: "STRING_VALUE", // required
              DomainName: "STRING_VALUE", // required
              OriginPath: "STRING_VALUE",
              CustomHeaders: { // CustomHeaders
                Quantity: Number("int"), // required
                Items: [ // OriginCustomHeadersList
                  { // OriginCustomHeader
                    HeaderName: "STRING_VALUE", // required
                    HeaderValue: "STRING_VALUE", // required
                  },
                ],
              },
              S3OriginConfig: { // S3OriginConfig
                OriginAccessIdentity: "STRING_VALUE", // required
              },
              CustomOriginConfig: { // CustomOriginConfig
                HTTPPort: Number("int"), // required
                HTTPSPort: Number("int"), // required
                OriginProtocolPolicy: "http-only" || "match-viewer" || "https-only", // required
                OriginSslProtocols: { // OriginSslProtocols
                  Quantity: Number("int"), // required
                  Items: [ // SslProtocolsList // required
                    "SSLv3" || "TLSv1" || "TLSv1.1" || "TLSv1.2",
                  ],
                },
                OriginReadTimeout: Number("int"),
                OriginKeepaliveTimeout: Number("int"),
              },
              ConnectionAttempts: Number("int"),
              ConnectionTimeout: Number("int"),
              OriginShield: { // OriginShield
                Enabled: true || false, // required
                OriginShieldRegion: "STRING_VALUE",
              },
              OriginAccessControlId: "STRING_VALUE",
            },
          ],
        },
        OriginGroups: { // OriginGroups
          Quantity: Number("int"), // required
          Items: [ // OriginGroupList
            { // OriginGroup
              Id: "STRING_VALUE", // required
              FailoverCriteria: { // OriginGroupFailoverCriteria
                StatusCodes: { // StatusCodes
                  Quantity: Number("int"), // required
                  Items: [ // StatusCodeList // required
                    Number("int"),
                  ],
                },
              },
              Members: { // OriginGroupMembers
                Quantity: Number("int"), // required
                Items: [ // OriginGroupMemberList // required
                  { // OriginGroupMember
                    OriginId: "STRING_VALUE", // required
                  },
                ],
              },
            },
          ],
        },
        DefaultCacheBehavior: { // DefaultCacheBehavior
          TargetOriginId: "STRING_VALUE", // required
          TrustedSigners: { // TrustedSigners
            Enabled: true || false, // required
            Quantity: Number("int"), // required
            Items: [ // AwsAccountNumberList
              "STRING_VALUE",
            ],
          },
          TrustedKeyGroups: { // TrustedKeyGroups
            Enabled: true || false, // required
            Quantity: Number("int"), // required
            Items: [ // TrustedKeyGroupIdList
              "STRING_VALUE",
            ],
          },
          ViewerProtocolPolicy: "allow-all" || "https-only" || "redirect-to-https", // required
          AllowedMethods: { // AllowedMethods
            Quantity: Number("int"), // required
            Items: [ // MethodsList // required
              "GET" || "HEAD" || "POST" || "PUT" || "PATCH" || "OPTIONS" || "DELETE",
            ],
            CachedMethods: { // CachedMethods
              Quantity: Number("int"), // required
              Items: [ // required
                "GET" || "HEAD" || "POST" || "PUT" || "PATCH" || "OPTIONS" || "DELETE",
              ],
            },
          },
          SmoothStreaming: true || false,
          Compress: true || false,
          LambdaFunctionAssociations: { // LambdaFunctionAssociations
            Quantity: Number("int"), // required
            Items: [ // LambdaFunctionAssociationList
              { // LambdaFunctionAssociation
                LambdaFunctionARN: "STRING_VALUE", // required
                EventType: "viewer-request" || "viewer-response" || "origin-request" || "origin-response", // required
                IncludeBody: true || false,
              },
            ],
          },
          FunctionAssociations: { // FunctionAssociations
            Quantity: Number("int"), // required
            Items: [ // FunctionAssociationList
              { // FunctionAssociation
                FunctionARN: "STRING_VALUE", // required
                EventType: "viewer-request" || "viewer-response" || "origin-request" || "origin-response", // required
              },
            ],
          },
          FieldLevelEncryptionId: "STRING_VALUE",
          RealtimeLogConfigArn: "STRING_VALUE",
          CachePolicyId: "STRING_VALUE",
          OriginRequestPolicyId: "STRING_VALUE",
          ResponseHeadersPolicyId: "STRING_VALUE",
          ForwardedValues: { // ForwardedValues
            QueryString: true || false, // required
            Cookies: { // CookiePreference
              Forward: "none" || "whitelist" || "all", // required
              WhitelistedNames: { // CookieNames
                Quantity: Number("int"), // required
                Items: [ // CookieNameList
                  "STRING_VALUE",
                ],
              },
            },
            Headers: { // Headers
              Quantity: Number("int"), // required
              Items: [ // HeaderList
                "STRING_VALUE",
              ],
            },
            QueryStringCacheKeys: { // QueryStringCacheKeys
              Quantity: Number("int"), // required
              Items: [ // QueryStringCacheKeysList
                "STRING_VALUE",
              ],
            },
          },
          MinTTL: Number("long"),
          DefaultTTL: Number("long"),
          MaxTTL: Number("long"),
        },
        CacheBehaviors: { // CacheBehaviors
          Quantity: Number("int"), // required
          Items: [ // CacheBehaviorList
            { // CacheBehavior
              PathPattern: "STRING_VALUE", // required
              TargetOriginId: "STRING_VALUE", // required
              TrustedSigners: {
                Enabled: true || false, // required
                Quantity: Number("int"), // required
                Items: [
                  "STRING_VALUE",
                ],
              },
              TrustedKeyGroups: {
                Enabled: true || false, // required
                Quantity: Number("int"), // required
                Items: [
                  "STRING_VALUE",
                ],
              },
              ViewerProtocolPolicy: "allow-all" || "https-only" || "redirect-to-https", // required
              AllowedMethods: {
                Quantity: Number("int"), // required
                Items: "<MethodsList>", // required
                CachedMethods: {
                  Quantity: Number("int"), // required
                  Items: "<MethodsList>", // required
                },
              },
              SmoothStreaming: true || false,
              Compress: true || false,
              LambdaFunctionAssociations: {
                Quantity: Number("int"), // required
                Items: [
                  {
                    LambdaFunctionARN: "STRING_VALUE", // required
                    EventType: "viewer-request" || "viewer-response" || "origin-request" || "origin-response", // required
                    IncludeBody: true || false,
                  },
                ],
              },
              FunctionAssociations: {
                Quantity: Number("int"), // required
                Items: [
                  {
                    FunctionARN: "STRING_VALUE", // required
                    EventType: "viewer-request" || "viewer-response" || "origin-request" || "origin-response", // required
                  },
                ],
              },
              FieldLevelEncryptionId: "STRING_VALUE",
              RealtimeLogConfigArn: "STRING_VALUE",
              CachePolicyId: "STRING_VALUE",
              OriginRequestPolicyId: "STRING_VALUE",
              ResponseHeadersPolicyId: "STRING_VALUE",
              ForwardedValues: {
                QueryString: true || false, // required
                Cookies: {
                  Forward: "none" || "whitelist" || "all", // required
                  WhitelistedNames: {
                    Quantity: Number("int"), // required
                    Items: [
                      "STRING_VALUE",
                    ],
                  },
                },
                Headers: {
                  Quantity: Number("int"), // required
                  Items: [
                    "STRING_VALUE",
                  ],
                },
                QueryStringCacheKeys: {
                  Quantity: Number("int"), // required
                  Items: [
                    "STRING_VALUE",
                  ],
                },
              },
              MinTTL: Number("long"),
              DefaultTTL: Number("long"),
              MaxTTL: Number("long"),
            },
          ],
        },
        CustomErrorResponses: { // CustomErrorResponses
          Quantity: Number("int"), // required
          Items: [ // CustomErrorResponseList
            { // CustomErrorResponse
              ErrorCode: Number("int"), // required
              ResponsePagePath: "STRING_VALUE",
              ResponseCode: "STRING_VALUE",
              ErrorCachingMinTTL: Number("long"),
            },
          ],
        },
        Comment: "STRING_VALUE", // required
        Logging: { // LoggingConfig
          Enabled: true || false, // required
          IncludeCookies: true || false, // required
          Bucket: "STRING_VALUE", // required
          Prefix: "STRING_VALUE", // required
        },
        PriceClass: "PriceClass_100" || "PriceClass_200" || "PriceClass_All",
        Enabled: true || false, // required
        ViewerCertificate: { // ViewerCertificate
          CloudFrontDefaultCertificate: true || false,
          IAMCertificateId: "STRING_VALUE",
          ACMCertificateArn: "STRING_VALUE",
          SSLSupportMethod: "sni-only" || "vip" || "static-ip",
          MinimumProtocolVersion: "SSLv3" || "TLSv1" || "TLSv1_2016" || "TLSv1.1_2016" || "TLSv1.2_2018" || "TLSv1.2_2019" || "TLSv1.2_2021",
          Certificate: "STRING_VALUE",
          CertificateSource: "cloudfront" || "iam" || "acm",
        },
        Restrictions: { // Restrictions
          GeoRestriction: { // GeoRestriction
            RestrictionType: "blacklist" || "whitelist" || "none", // required
            Quantity: Number("int"), // required
            Items: [ // LocationList
              "STRING_VALUE",
            ],
          },
        },
        WebACLId: "STRING_VALUE",
        HttpVersion: "http1.1" || "http2" || "http3" || "http2and3",
        IsIPV6Enabled: true || false,
        ContinuousDeploymentPolicyId: "STRING_VALUE",
        Staging: true || false,
      },
      AliasICPRecordals: [ // AliasICPRecordals
        { // AliasICPRecordal
          CNAME: "STRING_VALUE",
          ICPRecordalStatus: "APPROVED" || "SUSPENDED" || "PENDING",
        },
      ],
    },
    ETag: "STRING_VALUE",
  };

  const input = { // UpdateDistributionRequest
    DistributionConfig: { // DistributionConfig
      CallerReference: "STRING_VALUE", // required
      Aliases: { // Aliases
        Quantity: Number("int"), // required
        Items: [ // AliasList
          "STRING_VALUE",
        ],
      },
      DefaultRootObject: "STRING_VALUE",
      Origins: { // Origins
        Quantity: Number("int"), // required
        Items: [ // OriginList // required
          { // Origin
            Id: "STRING_VALUE", // required
            DomainName: "STRING_VALUE", // required
            OriginPath: "STRING_VALUE",
            CustomHeaders: { // CustomHeaders
              Quantity: Number("int"), // required
              Items: [ // OriginCustomHeadersList
                { // OriginCustomHeader
                  HeaderName: "STRING_VALUE", // required
                  HeaderValue: "STRING_VALUE", // required
                },
              ],
            },
            S3OriginConfig: { // S3OriginConfig
              OriginAccessIdentity: "STRING_VALUE", // required
            },
            CustomOriginConfig: { // CustomOriginConfig
              HTTPPort: Number("int"), // required
              HTTPSPort: Number("int"), // required
              OriginProtocolPolicy: "http-only" || "match-viewer" || "https-only", // required
              OriginSslProtocols: { // OriginSslProtocols
                Quantity: Number("int"), // required
                Items: [ // SslProtocolsList // required
                  "SSLv3" || "TLSv1" || "TLSv1.1" || "TLSv1.2",
                ],
              },
              OriginReadTimeout: Number("int"),
              OriginKeepaliveTimeout: Number("int"),
            },
            ConnectionAttempts: Number("int"),
            ConnectionTimeout: Number("int"),
            OriginShield: { // OriginShield
              Enabled: true || false, // required
              OriginShieldRegion: "STRING_VALUE",
            },
            OriginAccessControlId: "STRING_VALUE",
          },
        ],
      },
      OriginGroups: { // OriginGroups
        Quantity: Number("int"), // required
        Items: [ // OriginGroupList
          { // OriginGroup
            Id: "STRING_VALUE", // required
            FailoverCriteria: { // OriginGroupFailoverCriteria
              StatusCodes: { // StatusCodes
                Quantity: Number("int"), // required
                Items: [ // StatusCodeList // required
                  Number("int"),
                ],
              },
            },
            Members: { // OriginGroupMembers
              Quantity: Number("int"), // required
              Items: [ // OriginGroupMemberList // required
                { // OriginGroupMember
                  OriginId: "STRING_VALUE", // required
                },
              ],
            },
          },
        ],
      },
      DefaultCacheBehavior: { // DefaultCacheBehavior
        TargetOriginId: "STRING_VALUE", // required
        TrustedSigners: { // TrustedSigners
          Enabled: true || false, // required
          Quantity: Number("int"), // required
          Items: [ // AwsAccountNumberList
            "STRING_VALUE",
          ],
        },
        TrustedKeyGroups: { // TrustedKeyGroups
          Enabled: true || false, // required
          Quantity: Number("int"), // required
          Items: [ // TrustedKeyGroupIdList
            "STRING_VALUE",
          ],
        },
        ViewerProtocolPolicy: "allow-all" || "https-only" || "redirect-to-https", // required
        AllowedMethods: { // AllowedMethods
          Quantity: Number("int"), // required
          Items: [ // MethodsList // required
            "GET" || "HEAD" || "POST" || "PUT" || "PATCH" || "OPTIONS" || "DELETE",
          ],
          CachedMethods: { // CachedMethods
            Quantity: Number("int"), // required
            Items: [ // required
              "GET" || "HEAD" || "POST" || "PUT" || "PATCH" || "OPTIONS" || "DELETE",
            ],
          },
        },
        SmoothStreaming: true || false,
        Compress: true || false,
        LambdaFunctionAssociations: { // LambdaFunctionAssociations
          Quantity: Number("int"), // required
          Items: [ // LambdaFunctionAssociationList
            { // LambdaFunctionAssociation
              LambdaFunctionARN: "STRING_VALUE", // required
              EventType: "viewer-request" || "viewer-response" || "origin-request" || "origin-response", // required
              IncludeBody: true || false,
            },
          ],
        },
        FunctionAssociations: { // FunctionAssociations
          Quantity: Number("int"), // required
          Items: [ // FunctionAssociationList
            { // FunctionAssociation
              FunctionARN: "STRING_VALUE", // required
              EventType: "viewer-request" || "viewer-response" || "origin-request" || "origin-response", // required
            },
          ],
        },
        FieldLevelEncryptionId: "STRING_VALUE",
        RealtimeLogConfigArn: "STRING_VALUE",
        CachePolicyId: "STRING_VALUE",
        OriginRequestPolicyId: "STRING_VALUE",
        ResponseHeadersPolicyId: "STRING_VALUE",
        ForwardedValues: { // ForwardedValues
          QueryString: true || false, // required
          Cookies: { // CookiePreference
            Forward: "none" || "whitelist" || "all", // required
            WhitelistedNames: { // CookieNames
              Quantity: Number("int"), // required
              Items: [ // CookieNameList
                "STRING_VALUE",
              ],
            },
          },
          Headers: { // Headers
            Quantity: Number("int"), // required
            Items: [ // HeaderList
              "STRING_VALUE",
            ],
          },
          QueryStringCacheKeys: { // QueryStringCacheKeys
            Quantity: Number("int"), // required
            Items: [ // QueryStringCacheKeysList
              "STRING_VALUE",
            ],
          },
        },
        MinTTL: Number("long"),
        DefaultTTL: Number("long"),
        MaxTTL: Number("long"),
      },
      CacheBehaviors: { // CacheBehaviors
        Quantity: Number("int"), // required
        Items: [ // CacheBehaviorList
          { // CacheBehavior
            PathPattern: "STRING_VALUE", // required
            TargetOriginId: "STRING_VALUE", // required
            TrustedSigners: {
              Enabled: true || false, // required
              Quantity: Number("int"), // required
              Items: [
                "STRING_VALUE",
              ],
            },
            TrustedKeyGroups: {
              Enabled: true || false, // required
              Quantity: Number("int"), // required
              Items: [
                "STRING_VALUE",
              ],
            },
            ViewerProtocolPolicy: "allow-all" || "https-only" || "redirect-to-https", // required
            AllowedMethods: {
              Quantity: Number("int"), // required
              Items: "<MethodsList>", // required
              CachedMethods: {
                Quantity: Number("int"), // required
                Items: "<MethodsList>", // required
              },
            },
            SmoothStreaming: true || false,
            Compress: true || false,
            LambdaFunctionAssociations: {
              Quantity: Number("int"), // required
              Items: [
                {
                  LambdaFunctionARN: "STRING_VALUE", // required
                  EventType: "viewer-request" || "viewer-response" || "origin-request" || "origin-response", // required
                  IncludeBody: true || false,
                },
              ],
            },
            FunctionAssociations: {
              Quantity: Number("int"), // required
              Items: [
                {
                  FunctionARN: "STRING_VALUE", // required
                  EventType: "viewer-request" || "viewer-response" || "origin-request" || "origin-response", // required
                },
              ],
            },
            FieldLevelEncryptionId: "STRING_VALUE",
            RealtimeLogConfigArn: "STRING_VALUE",
            CachePolicyId: "STRING_VALUE",
            OriginRequestPolicyId: "STRING_VALUE",
            ResponseHeadersPolicyId: "STRING_VALUE",
            ForwardedValues: {
              QueryString: true || false, // required
              Cookies: {
                Forward: "none" || "whitelist" || "all", // required
                WhitelistedNames: {
                  Quantity: Number("int"), // required
                  Items: [
                    "STRING_VALUE",
                  ],
                },
              },
              Headers: {
                Quantity: Number("int"), // required
                Items: [
                  "STRING_VALUE",
                ],
              },
              QueryStringCacheKeys: {
                Quantity: Number("int"), // required
                Items: [
                  "STRING_VALUE",
                ],
              },
            },
            MinTTL: Number("long"),
            DefaultTTL: Number("long"),
            MaxTTL: Number("long"),
          },
        ],
      },
      CustomErrorResponses: { // CustomErrorResponses
        Quantity: Number("int"), // required
        Items: [ // CustomErrorResponseList
          { // CustomErrorResponse
            ErrorCode: Number("int"), // required
            ResponsePagePath: "STRING_VALUE",
            ResponseCode: "STRING_VALUE",
            ErrorCachingMinTTL: Number("long"),
          },
        ],
      },
      Comment: "STRING_VALUE", // required
      Logging: { // LoggingConfig
        Enabled: true || false, // required
        IncludeCookies: true || false, // required
        Bucket: "STRING_VALUE", // required
        Prefix: "STRING_VALUE", // required
      },
      PriceClass: "PriceClass_100" || "PriceClass_200" || "PriceClass_All",
      Enabled: true || false, // required
      ViewerCertificate: { // ViewerCertificate
        CloudFrontDefaultCertificate: true || false,
        IAMCertificateId: "STRING_VALUE",
        ACMCertificateArn: "STRING_VALUE",
        SSLSupportMethod: "sni-only" || "vip" || "static-ip",
        MinimumProtocolVersion: "SSLv3" || "TLSv1" || "TLSv1_2016" || "TLSv1.1_2016" || "TLSv1.2_2018" || "TLSv1.2_2019" || "TLSv1.2_2021",
        Certificate: "STRING_VALUE",
        CertificateSource: "cloudfront" || "iam" || "acm",
      },
      Restrictions: { // Restrictions
        GeoRestriction: { // GeoRestriction
          RestrictionType: "blacklist" || "whitelist" || "none", // required
          Quantity: Number("int"), // required
          Items: [ // LocationList
            "STRING_VALUE",
          ],
        },
      },
      WebACLId: "STRING_VALUE",
      HttpVersion: "http1.1" || "http2" || "http3" || "http2and3",
      IsIPV6Enabled: true || false,
      ContinuousDeploymentPolicyId: "STRING_VALUE",
      Staging: true || false,
    },
    Id: "STRING_VALUE", // required
    IfMatch: "STRING_VALUE",
  };
  const updateDistributionCommand = new UpdateDistributionCommand(input);
  const response = await client.send(updateDistributionCommand);

  response.send(event, context, 'SUCCESS', {});
};

const deleteResource = async (event, context, params) => {
  const getDistributionCommand = new GetDistributionCommand(params);
  const distribution = await client.send(getDistributionCommand);
  console.log(JSON.stringify(distribution));

  // const input = {}
  // const updateDistributionCommand = new UpdateDistributionCommand(input);
  // const response = await client.send(updateDistributionCommand);

  response.send(event, context, 'SUCCESS', {});
};
