# SvelteKit Adapter AWS

This project contains a SvelteKit adapter to deploy SvelteKit to AWS using AWS-CDK.

## How to use?

1. Create a SvelteKit project "my-app" - `npm create svelte@latest my-app`
2. `cd my-app`
3. `npm install`
4. `npm install -D sveltekit-adapter-aws`
5. edit **svelte.config.js**

## Basic setup example

**svelte.config.js**

```javascript
import { adapter } from 'sveltekit-adapter-aws';
import preprocess from 'svelte-preprocess';

export default {
  preprocess: preprocess(),
  kit: {
    adapter: adapter({
      autoDeploy: true,
    }),
  },
};
```

## Architecture

![Architecture](architecture.png)

## Configuration

```typescript
export interface AWSLambdaAdapterProps {
  memorySize?: number;
  logRetentionDays?: number;
  timeout?: number;
  runtime?: string;
  architecture?: 'ARM_64' | 'X86_64' | string;
}

export interface AWSCachingStaticAssetsProps {
  cacheControl: string;
}
export interface AWSCachePolicyProps {
  comment?: string;
  defaultTtl?: number;
  minTtl?: number;
  maxTtl?: number;
  enableAcceptEncodingGzip?: boolean;
  enableAcceptEncodingBrotli?: boolean;
}

export interface AWSCachingProps {
  staticAssets?: AWSCachingStaticAssetsProps;
  distributionDynamic?: AWSCachePolicyProps;
  distributionStatic?: AWSCachePolicyProps;
}

export interface AWSExistingResourcesProps {
  distributionId?: string;
  distributionDomainName?: string;
  staticBucketName?: string;
}

export interface AWSAdapterProps {
  artifactPath?: string; // Build output directory (default: build)
  autoDeploy?: boolean; // Should automatically deploy in SvelteKit build step (default: false)
  cdkProjectPath?: string; // AWS-CDK App file path for AWS-CDK custom deployment applications (e.g. ${process.cwd()}/deploy.js)
  stackName?: string; // AWS-CDK CloudFormation Stackname (default: AWSAdapterStack-Default)
  esbuildOptions?: any; // Override or extend default esbuild options. Supports `external` (default `['node:*']`), `format` (default `cjs`), `target` (default `node16`), `banner` (default `{}`).
  FQDN?: string; // Full qualified domain name of CloudFront deployment (e.g. demo.example.com)
  MEMORY_SIZE?: number; // Memory size of SSR lambda in MB (default 128 MB)
  LOG_RETENTION_DAYS?: number; // Log retention in days of SSR lambda (default 7 days)
  zoneName?: string; // The name of the hosted zone in Route 53 (defaults to the TLD from the FQDN)
  env?: { [key: string]: string };
  lambdaConfig?: AWSLambdaAdapterProps; // Customize lambda configuration. It is intended for upgrading to new nodejs version
  existingResources?: AWSExistingResourcesProps; // It will import existing AWS resources
  cacheConfig?: AWSCachingProps; // More customization about cache configuration for static and dynamic content
}
```

## Example usages

- [Basic](https://github.com/MikeBild/sveltekit-adapter-aws-basic-example)
- [Advanced](https://github.com/MikeBild/sveltekit-adapter-aws-advanced-example)
- [Full Workshop Example](https://github.com/MikeBild/serverless-workshop-sveltekit)

### Extended version
```
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// SSR with AWS
		adapter: adapter({
			stackName: 'dev-blog-ssr-adapter',
			autoDeploy: true,
			FQDN: 'your.domain.com',
			esbuildOptions: {
				target: 'node18'
			},
			existingResources: {
				distributionId: 'WWWXXXYYYZZZAA',
				distributionDomainName: 'https://cloudfrontdomainname.cloudfront.net'
			},
			lambdaConfig: {
				memorySize: 512,
				runtime: 'NODEJS_18_X',
				architecture: 'ARM_64',
				timeout: 300,
				logRetentionDays: 7
			},
			cacheConfig: {
				staticAssets: {
					cacheControl: 'public,max-age=31536000'
				},
				distributionStatic: {
					maxTtl: 31_536_000,
					minTtl: 31_536_000,
					defaultTtl: 31_536_000,
					enableAcceptEncodingGzip: true,
					enableAcceptEncodingBrotli: true,
					comment: 'Static files cache policy.'
				},
				distributionDynamic: {
					maxTtl: 31_536_000,
					minTtl: 31_536_000,
					defaultTtl: 31_536_000,
					enableAcceptEncodingGzip: true,
					comment: 'Dynamic server cache policy.'
				}
			}
		})
	},
};
```