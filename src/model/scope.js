// Time changes which rows are in scope, never the bar: below an item's coreBelow only its core rows stay.
export const inScope = (item, observable, minutes) => !item.coreBelow || minutes >= item.coreBelow || observable.core;
