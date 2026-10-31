import { underFloor } from '../model/scope.js';
import './floor-warning.css';

// A warning, never a block.
export const floorText = (item, minutes) => (underFloor(item, minutes) ? `Under ${item.floor} min, this gives little evidence.` : '');

export const floorWarning = (item, minutes) => `<span class="floor-warning" role="status">${floorText(item, minutes)}</span>`;
