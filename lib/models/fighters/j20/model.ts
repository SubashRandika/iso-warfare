import { jetModel } from '../jet/sim';
import { buildDragon } from './airframe';

export default jetModel(buildDragon, { refuelReadout: 'probe out' });
