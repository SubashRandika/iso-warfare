import { jetModel } from '../jet/sim';
import { buildRaptor } from './airframe';

export default jetModel(buildRaptor, { refuelReadout: 'receptacle open' });
