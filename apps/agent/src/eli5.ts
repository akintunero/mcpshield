import type { Finding } from '@mcpshield/types';
import type { LLMProvider } from '@mcpshield/types';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('agent:eli5');

const ELI5_PROMPTS = {
  explain: (finding: Finding) =>
    `You are a friendly cloud security mentor teaching a beginner. Explain this AWS security finding in simple terms:

Finding: ${finding.title}
Service: ${finding.service}
Severity: ${finding.severity}
Description: ${finding.description}

Please structure your explanation as:
1. **Simple Explanation** — Explain this like I'm new to cloud (2-3 sentences, no jargon without explanation)
2. **Why It Matters** — What could actually go wrong? A real-world scenario.
3. **The AWS Service** — What does ${finding.service} do? Why does it have this security setting?
4. **How We Fix It** — What the remediation does in plain language.
5. **Learn More** — One concrete thing they can look up next.

Keep it encouraging and educational. They're learning cloud security for the first time.`,

  quiz: (finding: Finding) =>
    `You are a cloud security mentor. Generate 3 quiz questions about this AWS finding to test understanding:

Finding: ${finding.title}
Service: ${finding.service}
Severity: ${finding.severity}
Description: ${finding.description}

For each question, provide:
- The question (multiple choice)
- 4 answer options
- The correct answer
- A brief explanation of why it's correct

Make the questions practical and scenario-based, not just definitions.`,

  mentorship: (finding: Finding) =>
    `You are a cloud security career mentor. A junior developer just encountered this finding:

Finding: ${finding.title}
Service: ${finding.service}
Severity: ${finding.severity}
Description: ${finding.description}

Provide:
1. **What I should learn next** — 2-3 related AWS security topics
2. **Hands-on practice** — A concrete exercise they can do in LocalStack
3. **Real-world context** — How this finding relates to actual security incidents
4. **Career tip** — How understanding this helps their cloud career

Keep it practical and actionable.`,
};

export async function explainFindingELI5(
  finding: Finding,
  llmProvider: LLMProvider,
): Promise<string> {
  logger.info(`Generating ELI5 explanation for finding: ${finding.findingId}`);
  const prompt = ELI5_PROMPTS.explain(finding);
  const response = await llmProvider.complete({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 1024,
  });
  return response.content;
}

export async function quizOnFinding(finding: Finding, llmProvider: LLMProvider): Promise<string> {
  logger.info(`Generating quiz for finding: ${finding.findingId}`);
  const prompt = ELI5_PROMPTS.quiz(finding);
  const response = await llmProvider.complete({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 1024,
  });
  return response.content;
}

export async function mentorshipAdvice(
  finding: Finding,
  llmProvider: LLMProvider,
): Promise<string> {
  logger.info(`Generating mentorship advice for finding: ${finding.findingId}`);
  const prompt = ELI5_PROMPTS.mentorship(finding);
  const response = await llmProvider.complete({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 1024,
  });
  return response.content;
}
