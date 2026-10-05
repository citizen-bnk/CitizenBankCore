import { resolveAnthropicEnv } from "../db/env";

/** Resolve only recognized provider key names; never log key values. */
export function resolveAIConfig(env: Record<string, string | undefined> = process.env) {
  if (env === process.env) resolveAnthropicEnv();
  const key = (name: string, aliases: string[]) => {
    if (env[name]?.trim()) return env[name]!.trim();
    const names = Object.keys(env).filter((n) =>
      (aliases.includes(n) || new RegExp(`^[A-Za-z0-9_]+_${name}$`).test(n)) && env[n]?.trim());
    return names.length === 1 ? env[names[0]]!.trim() : undefined;
  };
  const anthropic = key("ANTHROPIC_API_KEY", ["CLAUDE_API_KEY", "ANTHROPIC_KEY"]);
  const openai = key("OPENAI_API_KEY", []);
  const elevenlabs = key("ELEVENLABS_API_KEY", []);
  const model = (name: string, fallback: string) => env[name]?.trim() || fallback;
  return {
    anthropic, openai, elevenlabs,
    anthropicModel: model("ANTHROPIC_MODEL", "claude-sonnet-5"),
    openaiModel: model("OPENAI_MODEL", "gpt-5.4-mini"),
    elevenlabsModel: model("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
    speechModel: model("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
    speechVoice: model("OPENAI_TTS_VOICE", "coral"),
    voices: { en: env.ELEVENLABS_VOICE_EN?.trim(), st: env.ELEVENLABS_VOICE_ST?.trim(), zu: env.ELEVENLABS_VOICE_ZU?.trim() },
  };
}
export type AIConfig = ReturnType<typeof resolveAIConfig>;
