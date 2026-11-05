module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT || process.env.EXPO_PUBLIC_APP_VARIANT || "mobile";
  const isTv = variant === "tv";

  return {
    ...config,
    name: isTv ? "Hallyu TV" : "Hallyu Mobile",
    version: (process.env.APP_VERSION || config.version || "0.1.0").replace(/^v/, ""),
    slug: isTv ? "hallyu-tv" : "hallyu-mobile",
    scheme: isTv ? "hallyu-tv" : "hallyu-mobile",
    orientation: isTv ? "landscape" : "portrait",
    userInterfaceStyle: "dark",
    backgroundColor: "#080A0D",
    splash: {
      backgroundColor: "#080A0D",
      resizeMode: "contain",
    },
    android: {
      ...(config.android || {}),
      package: isTv ? "app.hallyutv.dev" : "app.hallyu.mobile",
      versionCode: Number(process.env.APP_VERSION_CODE) || (isTv ? 3 : 1),
      edgeToEdgeEnabled: true,
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#080A0D",
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
      backgroundColor: "#080A0D",
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
    },
  };
};
