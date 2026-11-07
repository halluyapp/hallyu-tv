import { registerRootComponent } from "expo";
import { enableFreeze } from "react-native-screens";

import App from "./src/App";

enableFreeze(true);
registerRootComponent(App);
