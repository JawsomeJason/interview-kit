// Time changes which rows are in scope, never the bar: below an item's coreBelow only its core rows stay.
export const inScope = (item, observable, minutes) => !item.coreBelow || minutes === 0 || minutes >= item.coreBelow || observable.core;

// Below its floor an activity still runs, it just cannot show much.
export const underFloor = (item, minutes) => minutes > 0 && minutes < item?.floor;
