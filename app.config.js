module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT || process.env.EXPO_PUBLIC_APP_VARIANT || "mobile";
  const isTv = variant === "tv";
  const version = (process.env.APP_VERSION || config.version || "0.1.0").replace(/^v/, "");
  const versionCode = Number(process.env.APP_VERSION_CODE) || (isTv ? 3 : 1);

  return {
    ...config,
    name: isTv ? "Hallyu TV" : "Hallyu Mobile",
    version,
    slug: isTv ? "hallyu-tv" : "hallyu-mobile",
    scheme: isTv ? "hallyu-tv" : "hallyu-mobile",
    orientation: isTv ? "landscape" : "portrait",
    userInterfaceStyle: "dark",
    backgroundColor: "#05080E",
    splash: {
      backgroundColor: "#05080E",
      resizeMode: "contain",
    },
    android: {
      ...(config.android || {}),
      package: isTv ? "app.hallyutv.dev" : "app.hallyu.mobile",
      versionCode,
      edgeToEdgeEnabled: true,
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#05080E",
      },
      permissions: [
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.REQUEST_INSTALL_PACKAGES",
      ],
    },
    androidStatusBar: {
      translucent: true,
      backgroundColor: "#05080E",
    },
    plugins: isTv
      ? [
          ["expo-video", { supportsPictureInPicture: true, supportsBackgroundPlayback: true }],
          "./plugins/withHallyuDownloader",
          "./plugins/withAndroidTvSupport",
        ]
      : [
          ["expo-video", { supportsPictureInPicture: true, supportsBackgroundPlayback: true }],
          "./plugins/withHallyuDownloader",
        ],
    extra: {
      appVariant: isTv ? "tv" : "mobile",
      packageName: isTv ? "app.hallyutv.dev" : "app.hallyu.mobile",
      appName: isTv ? "Hallyu TV" : "Hallyu Mobile",
      githubRepo: "halluyapp/hallyu-tv",
    },
  };
};
