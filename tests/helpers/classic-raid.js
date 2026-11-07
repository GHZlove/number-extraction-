// Isolate v0.1-v0.10 rule regressions from the opt-out-free v0.11 run systems.
// New run-depth tests import the production Raid directly.
import { Raid as CoreRaid } from '../../dist/src/game.js';
export class Raid extends CoreRaid {
 constructor(save,seed,options={}){super(save,seed,{...options,runRules:false});}
}
