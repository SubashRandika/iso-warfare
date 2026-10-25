import { jetModel } from '../../fighters/jet/sim';
import { buildSpirit } from './airframe';

export default jetModel(buildSpirit, { refuelReadout: 'receptacle open', canopyWord: 'hatch' });
