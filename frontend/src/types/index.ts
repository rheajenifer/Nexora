export type Course = { id: string; title: string; category: string; description: string; progress: number; lessons: number; duration: string; color: string; icon: string; topics: string[] }
export type Lesson = { id: string; courseId: string; title: string; duration: string; summary: string; objectives: string[]; explanation: string; example: string; vocabulary: { term: string; definition: string; sentence: string }[] }
export type QuizQuestion = { question: string; options: string[]; answer: number; explanation: string }
