const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          finding_id: { type: "string" },
          supported: { type: "boolean" },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          explanation: { type: "string" },
          recommendation: { type: "string" }
        },
        required: ["finding_id", "supported", "confidence", "explanation", "recommendation"]
      }
    }
  },
  required: ["reviews"]
};

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

export async function reviewWithOpenAI(result, { apiKey, model }) {
  if (!apiKey) return { result, used: false, warning: "OPENAI_API_KEY не настроен — использован локальный анализ." };

  const candidates = result.findings.slice(0, 50).map((finding) => ({
    finding_id: finding.id,
    type: finding.type,
    title: finding.title,
    explanation: finding.explanation,
    evidence: finding.evidence
  }));

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      instructions: [
        "Ты эксперт по организационному проектированию и внутреннему аудиту.",
        "Проверь только переданные выводы и их доказательства.",
        "Не добавляй факты, которых нет в цитатах. Если доказательств недостаточно, supported=false.",
        "Отличай перенос и переформулирование функции от её потери.",
        "Ответ должен быть на русском языке."
      ].join(" "),
      input: JSON.stringify({ task: "Проверка результатов сравнения документов", findings: candidates }),
      text: {
        format: {
          type: "json_schema",
          name: "organizational_audit_review",
          strict: true,
          schema
        }
      }
    }),
    signal: AbortSignal.timeout(120_000)
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI API: ${response.status} ${details.slice(0, 280)}`);
  }

  const payload = await response.json();
  const text = outputText(payload);
  if (!text) throw new Error("OpenAI API не вернул структурированный текст");
  const parsed = JSON.parse(text);
  const byId = new Map(parsed.reviews.map((item) => [item.finding_id, item]));

  result.findings = result.findings.map((finding) => {
    const review = byId.get(finding.id);
    if (!review) return finding;
    return {
      ...finding,
      aiReviewed: true,
      aiSupported: review.supported,
      confidence: review.confidence,
      explanation: review.explanation,
      recommendation: review.recommendation
    };
  });

  return { result, used: true, warning: "" };
}
