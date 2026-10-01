"use client";
import { Battle } from "../battle";
const SAMPLES: [number, string[]][] = [
  [0, ["", "", "", ""]],
  [1, ["", "오늘도 했다", "", ""]],
  [0, ["벌금 내기 싫으면 빨리 해라", "", "", ""]],
  [0, ["오늘 진짜 힘들었다ㅠㅠ", "", "", ""]],
];
export default function T() {
  return (
    <main className="flex-1 p-4 max-w-md mx-auto w-full space-y-4">
      {SAMPLES.map(([count, caps], i) => (
        <Battle key={i} myCount={count} otherCount={2} myName="나" otherName="친구" myFine={0} otherFine={0} myCaptions={caps} />
      ))}
    </main>
  );
}
