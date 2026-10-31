import './floor-warning.css';

// A warning, never a block: below its floor an activity still runs, it just cannot show much.
export const floorText = (item, minutes) => (minutes > 0 && minutes < item?.floor ? `Under ${item.floor} min, this gives little evidence.` : '');

export const floorWarning = (item, minutes) => `<span class="floor-warning" role="status">${floorText(item, minutes)}</span>`;
