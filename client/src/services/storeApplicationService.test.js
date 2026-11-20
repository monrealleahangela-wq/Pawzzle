import storeApplicationService, { STORE_APPLICATION_UPLOAD_TIMEOUT_MS } from './storeApplicationService';
import api from './apiService';

jest.mock('./apiService', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), patch: jest.fn(), put: jest.fn() }
}));

beforeEach(() => jest.clearAllMocks());

test.each([
  ['submitApplication', '/store-applications'],
  ['saveDraft', '/store-applications/draft'],
  ['submitExpansionRequest', '/store-applications/expansion']
])('%s allows enough time for secure multipart document persistence', async (method, endpoint) => {
  api.post.mockResolvedValue({ data: {} });
  const formData = new FormData();

  await storeApplicationService[method](formData);

  expect(STORE_APPLICATION_UPLOAD_TIMEOUT_MS).toBe(120000);
  expect(api.post).toHaveBeenCalledWith(endpoint, formData, expect.objectContaining({
    timeout: 120000,
    headers: { 'Content-Type': 'multipart/form-data' }
  }));
});
