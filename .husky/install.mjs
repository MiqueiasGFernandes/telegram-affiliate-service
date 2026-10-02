const shouldSkipHuskyInstall = process.env.CI === 'true' || process.env.NODE_ENV === 'production';

if (!shouldSkipHuskyInstall) {
  const husky = (await import('husky')).default;
  const message = husky();

  if (message) {
    console.log(message);
  }
}
