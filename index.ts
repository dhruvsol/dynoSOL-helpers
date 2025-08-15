import axios from "axios";
import data from "./data.json";
import fs from "fs";

// Keep important epochs (sorted for safety)
const importantEpochs = [805, 806, 807, 823, 824, 825, 796, 795, 797].sort(
	(a, b) => a - b,
);

type InputRow = { identity: string };

interface FilteredStakeData {
	// epoch -> Stake (already scaled to "stake units" after division)
	map: Map<number, number>;
}

type StakeData = {
	epoch: number;
	stake: number; // raw, will divide by 1e9 below
};

const GROUPS: { key: "G1" | "G2" | "G3"; label: string; epochs: number[] }[] = [
	{ key: "G1", label: "795-797", epochs: [795, 796, 797] },
	{ key: "G2", label: "805-807", epochs: [805, 806, 807] },
	{ key: "G3", label: "823-825", epochs: [823, 824, 825] },
];

const readData = (): InputRow[] => data as InputRow[];

const getStakeData = async (identity: string): Promise<StakeData[]> => {
	try {
		const stakeDataRes = await axios.post(
			"https://api.vx.tools/epochs/income",
			{
				identity,
				limit: 100,
			},
		);
		return stakeDataRes.data as StakeData[];
	} catch (error) {
		console.error(`Failed to fetch for ${identity}:`, error);
		return [];
	}
};

const filterEpochData = (rows: StakeData[]): FilteredStakeData => {
	const map = new Map<number, number>();
	for (const epoch of importantEpochs) {
		const stake = rows.find((d) => d.epoch === epoch)?.stake ?? 0;
		// Scale down to "stake units"
		map.set(epoch, stake / 1_000_000_000);
	}
	return { map };
};

const average = (nums: number[]) =>
	nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;

const groupAverage = (m: Map<number, number>, epochs: number[]) =>
	average(epochs.map((e) => m.get(e) ?? 0));

const growth = (from: number, to: number) => {
	const abs = to - from;
	const pct = from === 0 ? null : abs / from; // null -> undefined growth rate if baseline is 0
	return { abs, pct };
};

const fmtPct = (p: number | null) =>
	p === null ? "n/a" : `${(p * 100).toFixed(2)}%`;

/** Create an ASCII table string from rows (like console.table, but capturable) */
const toTable = (rows: Array<Record<string, string | number>>): string => {
	if (!rows.length) return "";
	const headers = Object.keys(rows[0]);
	const colWidths = headers.map((h) =>
		Math.max(h.length, ...rows.map((r) => String(r[h]).length)),
	);

	const sep = "+" + colWidths.map((w) => "-".repeat(w + 2)).join("+") + "+";
	const headerLine =
		"|" +
		headers.map((h, i) => " " + h.padEnd(colWidths[i]) + " ").join("|") +
		"|";
	const rowLines = rows
		.map(
			(r) =>
				"|" +
				headers
					.map((h, i) => " " + String(r[h]).padEnd(colWidths[i]) + " ")
					.join("|") +
				"|",
		)
		.join("\n");

	return [sep, headerLine, sep, rowLines, sep].join("\n");
};

const main = async () => {
	const identities = readData();

	// Fetch all in parallel
	const perIdentity = await Promise.all(
		identities.map(async ({ identity }) => {
			const stakeRows = await getStakeData(identity);
			const filtered = filterEpochData(stakeRows);

			const g1 = groupAverage(filtered.map, GROUPS[0].epochs);
			const g2 = groupAverage(filtered.map, GROUPS[1].epochs);
			const g3 = groupAverage(filtered.map, GROUPS[2].epochs);

			const g1g2 = growth(g1, g2);
			const g2g3 = growth(g2, g3);
			const g1g3 = growth(g1, g3);

			return {
				identity,
				G1_avg: g1,
				G2_avg: g2,
				G3_avg: g3,
				G1_to_G2_pct: g1g2.pct,
				G2_to_G3_pct: g2g3.pct,
				G1_to_G3_pct: g1g3.pct,
			};
		}),
	);

	// Build display rows (same as your console.table columns)
	const displayRows = perIdentity.map((r) => ({
		identity: r.identity,
		"G1 avg (795-797)": r.G1_avg.toFixed(6),
		"G2 avg (805-807)": r.G2_avg.toFixed(6),
		"G3 avg (823-825)": r.G3_avg.toFixed(6),
		"G1→G2 %": fmtPct(r.G1_to_G2_pct),
		"G2→G3 %": fmtPct(r.G2_to_G3_pct),
		"G1→G3 %": fmtPct(r.G1_to_G3_pct),
	}));

	// Create ASCII table string
	const tableStr = toTable(displayRows);

	// Print to console (optional) and write to avg.txt
	console.log("\nPer-identity averages and growth:");
	console.log(tableStr);

	fs.writeFileSync("avg.txt", tableStr + "\n", "utf8");
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
