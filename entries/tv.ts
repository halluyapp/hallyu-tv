import { registerRootComponent } from "expo";
import { enableFreeze } from "react-native-screens";
import { TvApp } from "../src/apps/tv/TvApp";

enableFreeze(true);
registerRootComponent(TvApp);
