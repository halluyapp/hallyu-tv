import { registerRootComponent } from "expo";
import { enableFreeze } from "react-native-screens";
import { MobileApp } from "../src/apps/mobile/MobileApp";

enableFreeze(true);
registerRootComponent(MobileApp);
