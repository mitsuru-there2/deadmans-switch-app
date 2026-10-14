const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');
// Expo 57.0.28 ships the scene delegate, but its generated template still creates
// an AppDelegate window. Xcode 27 requires UIScene. Use Expo's own forwarding.
function migrate(contents) {
  let result = contents;
  if (!result.includes('ExpoReactNativeFactoryProvider')) {
    const signature = 'class AppDelegate: ExpoAppDelegate {';
    if (!result.includes(signature)) throw new Error('Unsupported AppDelegate template: review scene lifecycle migration');
    result = result.replace(signature, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
  }
  if (result.includes('window = UIWindow(frame: UIScreen.main.bounds)')) {
    const windowStart = /#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen.main.bounds\)\s+factory.startReactNative\([\s\S]*?launchOptions: launchOptions\)\s*#endif/;
    if (!windowStart.test(result)) throw new Error('Unsupported window startup: review scene lifecycle migration');
    result = result.replace(windowStart, '// ExpoAppSceneDelegate creates the window and starts React Native.');
  }
  return result;
}
function withSceneLifecycle(config) {
  config = withInfoPlist(config, config => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Default Configuration',
          UISceneClassName: 'UIWindowScene',
          UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
        }],
      },
    };
    return config;
  });
  return withAppDelegate(config, config => {
    if (config.modResults.language !== 'swift') throw new Error('Swift AppDelegate required');
    config.modResults.contents = migrate(config.modResults.contents);
    return config;
  });
}
module.exports = withSceneLifecycle;
module.exports.migrate = migrate;
