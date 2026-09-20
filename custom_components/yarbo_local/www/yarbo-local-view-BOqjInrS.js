function e(e) {
	if (!e || typeof e.entity != "string" || !e.entity) throw Error("Set entity to any Yarbo Local entity, for example the robot's location tracker");
}
function t(e) {
	return Math.ceil((e?.height ?? 440) / 50) + 1;
}
function n(e) {
	return {
		columns: 12,
		rows: Math.ceil((e?.height ?? 440) / 56) + 2,
		min_columns: 6,
		min_rows: 5
	};
}
//#endregion
export { e as n, n as r, t };
