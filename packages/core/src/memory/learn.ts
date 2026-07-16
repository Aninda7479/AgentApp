import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentMessage } from '../types/agent.js';

/** A single insight learned from conversation or execution trajectories. */
export interface LearnedInsight {
  id: string;
  topic: string;
  lesson: string;
  category: 'error_prevention' | 'user_preference' | 'workflow_optimization';
  timestamp: number;
}

/** Extracts, stores, and retrieves learned insights from agent trajectories. */
export class LearningLoopEngine {
  private filePath: string;
  private insights: LearnedInsight[] = [];
  private loaded: boolean = false;

  constructor(customPath?: string) {
    this.filePath = customPath || path.join(process.cwd(), 'logs', 'learned_insights.json');
  }

  public async load(): Promise<LearnedInsight[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      this.insights = JSON.parse(content) as LearnedInsight[];
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') {
        this.insights = [];
      } else {
        // A present-but-unreadable/corrupt file must not break the feature.
        // Recover with an empty set rather than throwing (the next save writes
        // a fresh, valid file).
        console.warn(`Learned insights file at ${this.filePath} was unreadable; starting fresh.`);
        this.insights = [];
      }
    }
    this.loaded = true;
    return this.insights;
  }

  public async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.insights, null, 2), 'utf-8');
  }

  public async saveInsight(
    topic: string,
    lesson: string,
    category: LearnedInsight['category'] = 'workflow_optimization'
  ): Promise<LearnedInsight> {
    if (!this.loaded) {
      await this.load();
    }

    const insight: LearnedInsight = {
      id: `insight-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      topic,
      lesson,
      category,
      timestamp: Date.now()
    };

    this.insights.push(insight);
    await this.save();
    return insight;
  }

  public async extractLearningsFromTrajectory(trajectoryMessages: AgentMessage[]): Promise<LearnedInsight[]> {
    if (!this.loaded) {
      await this.load();
    }

    const extracted: LearnedInsight[] = [];

    for (const msg of trajectoryMessages) {
      const content = msg.content;

      // Extract error prevention insights
      if (content.toLowerCase().includes('error') || content.toLowerCase().includes('failed')) {
        if (content.toLowerCase().includes('fix') || content.toLowerCase().includes('resolved')) {
          const insight = await this.saveInsight(
            'Error Resolution',
            `Detected error resolution pattern in trajectory: ${content.substring(0, 100)}...`,
            'error_prevention'
          );
          extracted.push(insight);
        }
      }

      // Extract explicit learn commands or tags
      if (content.includes('/learn') || content.toLowerCase().includes('lesson learned:')) {
        const lessonText = content.replace(/\/learn/g, '').trim();
        const insight = await this.saveInsight(
          'User Instruction',
          lessonText,
          'user_preference'
        );
        extracted.push(insight);
      }
    }

    return extracted;
  }

  public async getInsights(topic?: string): Promise<LearnedInsight[]> {
    if (!this.loaded) {
      await this.load();
    }

    if (!topic) {
      return [...this.insights];
    }

    const t = topic.toLowerCase();
    return this.insights.filter(i => i.topic.toLowerCase().includes(t) || i.lesson.toLowerCase().includes(t));
  }

  public async clearInsights(): Promise<void> {
    this.insights = [];
    await this.save();
  }
}
