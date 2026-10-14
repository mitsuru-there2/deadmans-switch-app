export type WritingTemplate = {
  id: string;
  title: string;
  hint: string;
  questions: readonly string[];
};
// Product definitions, not API categories: answers become editable ordinary message text.
export const templates: readonly WritingTemplate[] = [
  {
    id: "money",
    title: "契約・お金",
    hint: "書類の場所や、連絡してほしい窓口",
    questions: [
      "どの契約・手続きについてですか？",
      "書類や連絡先はどこにありますか？",
      "相手に何をお願いしたいですか？",
    ],
  },
  {
    id: "belongings",
    title: "持ち物・データ",
    hint: "大切なものの行き先と扱い方",
    questions: [
      "何を引き継いでほしいですか？",
      "どこに保管していますか？",
      "どのように扱ってほしいですか？",
    ],
  },
  {
    id: "pets",
    title: "ペット",
    hint: "いつものお世話、病院、好きなこと",
    questions: [
      "名前と普段の様子を教えてください",
      "食事やお薬で気をつけることは？",
      "相談先とお願いしたいことは？",
    ],
  },
  {
    id: "work",
    title: "仕事・活動",
    hint: "引き継ぎ先と、途中のこと",
    questions: [
      "引き継ぎたい仕事・活動は？",
      "誰に連絡してほしいですか？",
      "資料の場所と注意点は？",
    ],
  },
  {
    id: "contacts",
    title: "連絡先",
    hint: "知らせてほしい人と伝え方",
    questions: ["誰に知らせてほしいですか？", "連絡方法は？", "何を伝えてほしいですか？"],
  },
  {
    id: "words",
    title: "あなたへの言葉",
    hint: "ありがとうも、言えなかったことも",
    questions: ["いちばん伝えたいことは？", "一緒に過ごした思い出は？", "最後に添えたい言葉は？"],
  },
  {
    id: "private",
    title: "秘密の依頼",
    hint: "その人だけに頼んでおきたいこと",
    questions: [
      "その人にだけ頼みたいことは？",
      "必要な場所・手がかりは？",
      "配慮してほしいことは？",
    ],
  },
];
export function composeSection(template: WritingTemplate, answers: readonly string[]) {
  return [
    template.title,
    ...answers
      .map((answer, i) => (answer.trim() ? `${template.questions[i]}\n${answer.trim()}` : ""))
      .filter(Boolean),
  ].join("\n\n");
}
