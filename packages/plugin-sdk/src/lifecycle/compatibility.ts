export class VersionCompatibility {
  private static readonly SUPPORTED_VERSIONS = new Set(['v1']);

  /** Check if an API version is supported by this core. */
  static isSupported(apiVersion: string): boolean {
    return VersionCompatibility.SUPPORTED_VERSIONS.has(apiVersion);
  }

  /** All API versions the current core supports. */
  static supportedVersions(): string[] {
    return [...VersionCompatibility.SUPPORTED_VERSIONS];
  }

  /** Validate that a plugin's manifest matches what the core expects. */
  static validate(manifest: { apiVersion: string; capabilities: string[] }): string[] {
    const errors: string[] = [];
    if (!VersionCompatibility.isSupported(manifest.apiVersion)) {
      errors.push(
        `API version "${manifest.apiVersion}" not supported. ` +
        `Supported: ${VersionCompatibility.supportedVersions().join(', ')}`,
      );
    }
    return errors;
  }
}
