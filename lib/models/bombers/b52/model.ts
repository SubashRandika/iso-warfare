import { jetModel } from '../../fighters/jet/sim';
import { buildStratofortress } from './airframe';

export default jetModel(buildStratofortress, { refuelReadout: 'receptacle open', canopyWord: 'hatch' });
