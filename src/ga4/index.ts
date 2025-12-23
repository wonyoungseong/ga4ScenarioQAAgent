/**
 * GA4 API 모듈
 */

export {
  GA4Client,
  GA4Event,
  GA4EventParameter,
  GA4PageEvent,
  GA4PageEventWithProportion,
  GA4PageEventAnalysis,
  GA4QueryOptions,
  GA4ClientConfig,
  GA4OAuthConfig,
  GA4AuthType,
  createGA4ClientFromEnv,
} from './ga4Client';

export {
  GA4AdminClient,
  GA4AdminClientConfig,
  GA4Account,
  GA4Property,
  AuthType,
} from './ga4AdminClient';

export {
  ServiceAccountAuth,
  ServiceAccountConfig,
  ServiceAccountCredentials,
  GA4_SCOPES,
  GA4_ADMIN_SCOPES,
  hasServiceAccountKey,
  printServiceAccountSetupGuide,
} from './serviceAccountAuth';
