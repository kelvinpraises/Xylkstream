/**
 * Environment Variables Validation
 * Validates required and optional environment variables on server startup
 */

export function validateEnvironment(): void {
  const required = [
    'PRIVY_APP_ID',
    'PRIVY_SECRET',
    'TURSO_APP_DB_URL',
  ];

  const optional = [
    'TEMPO_RPC_URL',
    'TURSO_AUTH_TOKEN',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error('\nPlease set these variables in your .env file');
    process.exit(1);
  }

  console.log('Required environment variables validated');

  // Warn about missing optional vars
  const missingOptional = optional.filter((key) => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn('Optional environment variables not set (using defaults):');
    missingOptional.forEach((key) => console.warn(`   - ${key}`));
  }
}
