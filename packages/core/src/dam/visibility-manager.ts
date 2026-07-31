/**
 * Folder & Path Visibility Manager
 * Manages public vs private folder access strategy for DAM assets.
 * By default, root assets and all folders are PRIVATE unless explicitly marked public.
 */

export interface FolderVisibilityRule {
  pathPrefix: string;
  isPublic: boolean;
}

export class FolderVisibilityManager {
  private rules: FolderVisibilityRule[] = [];

  constructor(initialRules: FolderVisibilityRule[] = []) {
    for (const rule of initialRules) {
      this.setFolderVisibility(rule.pathPrefix, rule.isPublic);
    }
  }

  /**
   * Normalize path to start with '/' and strip trailing slashes (except root)
   */
  private normalizePath(pathStr: string): string {
    let clean = pathStr.trim().replace(/\\/g, '/');
    if (!clean.startsWith('/')) {
      clean = '/' + clean;
    }
    if (clean.length > 1 && clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    return clean;
  }

  /**
   * Mark a folder path prefix as public or private.
   */
  public setFolderVisibility(folderPath: string, isPublic: boolean): void {
    const normalized = this.normalizePath(folderPath);
    // Remove existing rule for exact path prefix if present
    this.rules = this.rules.filter((r) => r.pathPrefix !== normalized);
    // Add new rule at the beginning (more specific rules registered later take precedence)
    this.rules.unshift({ pathPrefix: normalized, isPublic });
  }

  /**
   * Check if a normalized path matches a rule prefix or wildcard glob pattern.
   */
  private matchesRule(normalizedPath: string, rulePrefix: string): boolean {
    if (rulePrefix === '/') {
      return true;
    }
    if (rulePrefix.includes('*')) {
      const regexStr = rulePrefix
        .replace(/([.+^${}()|[\]\\])/g, '\\$1')
        .replace(/\*\*/g, '___DOUBLE_STAR___')
        .replace(/\*/g, '[^/]*')
        .replace(/___DOUBLE_STAR___/g, '.*');
      const regex = new RegExp(`^${regexStr}$`);
      return regex.test(normalizedPath);
    }
    return (
      normalizedPath === rulePrefix ||
      normalizedPath.startsWith(rulePrefix + '/')
    );
  }

  /**
   * Check if an asset path is in a public folder.
   * Defaults to FALSE (private) if no matching public rule is found.
   */
  public isPathPublic(pimcorePath: string): boolean {
    const normalized = this.normalizePath(pimcorePath);

    for (const rule of this.rules) {
      if (this.matchesRule(normalized, rule.pathPrefix)) {
        return rule.isPublic;
      }
    }

    return false; // Default: private
  }

  /**
   * Get all registered visibility rules.
   */
  public getRules(): ReadonlyArray<FolderVisibilityRule> {
    return this.rules;
  }
}
