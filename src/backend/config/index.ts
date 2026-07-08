import fs from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  workspacePath: string;
  geminiApiKey?: string;
  claudeCliPath?: string;
  serverPort: number;
}

export class ConfigManager {
  private static readonly configFilename = 'config.json';
  private static readonly configDirectory = '.mission-control';

  private static getConfigPath(): string {
    const currentDirectory = process.cwd();
    const configFolder = path.join(currentDirectory, this.configDirectory);
    if (!fs.existsSync(configFolder)) {
      fs.mkdirSync(configFolder, { recursive: true });
    }
    return path.join(configFolder, this.configFilename);
  }

  public static load(): AppConfig {
    const defaultSettings: AppConfig = {
      workspacePath: process.cwd(),
      serverPort: 3031,
      claudeCliPath: 'claude',
      geminiApiKey: process.env.GEMINI_API_KEY || ''
    };

    const targetPath = this.getConfigPath();
    if (!fs.existsSync(targetPath)) {
      this.save(defaultSettings);
      return defaultSettings;
    }

    try {
      const rawData = fs.readFileSync(targetPath, 'utf8');
      const parsedData = JSON.parse(rawData);
      return { ...defaultSettings, ...parsedData };
    } catch {
      return defaultSettings;
    }
  }

  public static save(config: AppConfig): void {
    const targetPath = this.getConfigPath();
    const jsonString = JSON.stringify(config, null, 2);
    fs.writeFileSync(targetPath, jsonString, 'utf8');
  }
}
