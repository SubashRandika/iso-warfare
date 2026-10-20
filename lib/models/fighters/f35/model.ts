import { jetModel } from '../jet/sim';
import { buildLightning } from './airframe';

export default jetModel(buildLightning, { refuelReadout: 'probe out' });
