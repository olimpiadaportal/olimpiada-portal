/**
 * App Version Management Service
 * Client-safe wrapper around protected admin API routes.
 */

export interface AppVersion {
  id: string;
  version: string;
  build_number: number;
  platform: 'ios' | 'android';
  force_update: boolean;
  update_message: string;
  update_message_az: string;
  update_message_ru: string;
  ios_url: string | null;
  android_url: string | null;
  created_at: string;
}

export interface CreateAppVersionInput {
  version: string;
  build_number: number;
  platform: 'ios' | 'android';
  force_update: boolean;
  update_message: string;
  update_message_az: string;
  update_message_ru: string;
  ios_url?: string;
  android_url?: string;
}

class AppVersionService {
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || 'App version request failed');
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  async getAllVersions(): Promise<AppVersion[]> {
    return this.request<AppVersion[]>('/api/settings/app-versions');
  }

  async getVersionsByPlatform(platform: 'ios' | 'android'): Promise<AppVersion[]> {
    return this.request<AppVersion[]>(`/api/settings/app-versions?platform=${platform}`);
  }

  async getLatestVersion(platform: 'ios' | 'android'): Promise<AppVersion | null> {
    const versions = await this.getVersionsByPlatform(platform);
    return versions[0] || null;
  }

  async createVersion(input: CreateAppVersionInput): Promise<AppVersion> {
    return this.request<AppVersion>('/api/settings/app-versions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateVersion(id: string, updates: Partial<CreateAppVersionInput>): Promise<AppVersion> {
    return this.request<AppVersion>(`/api/settings/app-versions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteVersion(id: string): Promise<void> {
    await this.request<void>(`/api/settings/app-versions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async versionExists(version: string, buildNumber: number, platform: 'ios' | 'android'): Promise<boolean> {
    const versions = await this.getVersionsByPlatform(platform);
    return versions.some((item) => item.version === version && item.build_number === buildNumber);
  }
}

export const appVersionService = new AppVersionService();
