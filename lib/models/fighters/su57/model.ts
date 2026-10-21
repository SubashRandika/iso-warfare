import { jetModel } from '../jet/sim';
import { buildFelon } from './airframe';

export default jetModel(buildFelon, { refuelReadout: 'probe out' });
