export interface UserByokSettingsRow {
  user_id: string;
  base_url: string;
  model: string;
  api_key_enc: string;
  enabled: boolean;
}

export interface ByokDecryptedSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
}
