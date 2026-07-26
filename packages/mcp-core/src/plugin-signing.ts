import { createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-core:plugin-signing');
const ALGORITHM = 'ed25519';
const SIG_EXTENSION = '.sig';

/**
 * Plugin signing using Ed25519.
 * Every released plugin is signed so consumers can verify authenticity.
 */
export class PluginSigning {
  /**
   * Generate a new signing key pair.
   * Returns { publicKey, privateKey } as PEM-encoded strings.
   */
  static generateKeyPair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = generateKeyPairSync(ALGORITHM, {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { publicKey, privateKey };
  }

  /**
   * Sign a plugin manifest.
   * Creates {plugin.json}.sig containing the signature.
   */
  static signPlugin(pluginDir: string, privateKeyPem: string): void {
    const manifestPath = join(pluginDir, 'plugin.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`plugin.json not found in ${pluginDir}`);
    }

    const manifest = readFileSync(manifestPath, 'utf8');
    const sign = createSign(ALGORITHM);
    sign.update(manifest);
    sign.end();

    const signature = sign.sign(privateKeyPem);
    const sigPath = join(pluginDir, `plugin.json${SIG_EXTENSION}`);
    writeFileSync(sigPath, signature);
    logger.info(`Signed plugin at ${pluginDir}`);
  }

  /**
   * Verify a plugin's signature.
   * Returns true if the manifest matches the signature.
   */
  static verifyPlugin(pluginDir: string, publicKeyPem: string): boolean {
    const manifestPath = join(pluginDir, 'plugin.json');
    const sigPath = join(pluginDir, `plugin.json${SIG_EXTENSION}`);

    if (!existsSync(manifestPath)) {
      logger.error(`plugin.json not found in ${pluginDir}`);
      return false;
    }
    if (!existsSync(sigPath)) {
      logger.warn(`No signature file found for plugin at ${pluginDir}`);
      return false;
    }

    try {
      const manifest = readFileSync(manifestPath, 'utf8');
      const signature = readFileSync(sigPath);
      const verify = createVerify(ALGORITHM);
      verify.update(manifest);
      verify.end();
      return verify.verify(publicKeyPem, signature);
    } catch (e: any) {
      logger.error(`Signature verification failed: ${e.message}`);
      return false;
    }
  }
}
