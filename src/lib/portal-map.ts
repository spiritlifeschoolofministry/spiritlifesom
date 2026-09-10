/**
 * What every page in the portal is for, in one place.
 *
 * This exists so the assistant can answer "where do I submit a task?" without
 * a model, without a network call, and without anybody writing a user manual.
 * The sidebars already know the portal's shape — group, label, path — and they
 * are kept current because they render from it. The only thing they do not
 * carry is a sentence saying what you can do on each page, which is what this
 * adds.
 *
 * `portal-map.test.ts` asserts this covers exactly the paths the two sidebars
 * navigate to, in both directions. So a page added without a description here,
 * or a description left behind after a page is removed, fails the build rather
 * than quietly making the assistant wrong.
 *
 * Answers built from this are facts about the software, not model output. They
 * are never wrong in the way a generated answer can be wrong, and they cost
 * nothing.
 */

export interface PortalPage {
  path: string;
  /** The sidebar's own label, so an answer names what the student will look for. */
  label: string;
  /** The sidebar section it sits under, for "it's under Learning". */
  group: string;
  /** What you can do there, second person, one sentence. */
  what: string;
  /**
   * Extra words a student or staff member might use for this page that the
   * label does not contain. "Task" is in the label; "essay" and "homework" are
   * not, and are what people actually type.
   */
  aliases?: string[];
}

export const STUDENT_PAGES: PortalPage[] = [
  {
    path: '/student/dashboard',
    label: 'Dashboard',
    group: 'Overview',
    what: 'see everything at a glance — attendance, courses, tasks and fees',
    aliases: ['home', 'overview', 'front page'],
  },
  {
    path: '/student/courses',
    label: 'My Courses',
    group: 'Learning',
    what: 'see the courses you are enrolled on this session',
    aliases: ['subjects', 'modules', 'enrolled'],
  },
  {
    path: '/student/materials',
    label: 'Course Materials',
    group: 'Learning',
    what: 'read and download the notes, handouts and files your lecturers have uploaded',
    aliases: ['notes', 'handouts', 'download', 'pdf', 'slides', 'resources', 'files', 'books'],
  },
  {
    path: '/student/assignments',
    label: 'Tasks',
    group: 'Learning',
    what: 'see what has been set and submit your work',
    aliases: ['assignment', 'assignments', 'homework', 'essay', 'submit', 'upload work', 'coursework'],
  },
  {
    path: '/student/exams',
    label: 'Exams',
    group: 'Learning',
    what: 'see upcoming exams and sit one when it opens',
    aliases: ['test', 'paper', 'sitting', 'quiz'],
  },
  {
    path: '/student/study',
    label: 'Study',
    group: 'Learning',
    what: 'practise with ungraded questions and ask about your own course materials',
    aliases: ['practice', 'practise', 'revise', 'revision', 'ask'],
  },
  {
    path: '/student/attendance',
    label: 'Attendance',
    group: 'My Record',
    what: 'check in for class and see your attendance record',
    aliases: ['check in', 'present', 'absent', 'register', 'sign in for class'],
  },
  {
    path: '/student/grades',
    label: 'Assessments',
    group: 'My Record',
    what: 'see your marks for every task and exam once they are released',
    aliases: ['grade', 'grades', 'marks', 'score', 'result', 'results'],
  },
  {
    path: '/student/transcript',
    label: 'Transcript',
    group: 'My Record',
    what: 'see your full academic record across the session',
    aliases: ['academic record', 'gpa'],
  },
  {
    path: '/student/certificate',
    label: 'Certificate',
    group: 'My Record',
    what: 'view or download your certificate, and request the name printed on it',
    aliases: ['certification', 'graduate', 'graduation', 'name on certificate', 'diploma'],
  },
  {
    path: '/student/fees',
    label: 'Fees',
    group: 'My Record',
    what: 'see what you owe and upload a receipt for a bank transfer',
    aliases: ['fee', 'pay', 'payment', 'owe', 'balance', 'receipt', 'school fees', 'money', 'tuition'],
  },
  {
    path: '/student/announcements',
    label: 'Announcements',
    group: 'Community',
    what: 'read notices from the school',
    aliases: ['notice', 'notices', 'news', 'updates'],
  },
  {
    path: '/student/calendar',
    label: 'Calendar',
    group: 'Community',
    what: 'see the class timetable, events and holidays',
    aliases: ['timetable', 'schedule', 'events', 'holiday', 'when is class'],
  },
  {
    path: '/student/coursemates',
    label: 'Course Mates',
    group: 'Community',
    what: 'see who else is on your cohort',
    aliases: ['classmates', 'class list', 'other students'],
  },
  {
    path: '/student/graduates',
    label: 'Graduates',
    group: 'Community',
    what: 'browse students who have graduated from the school',
    aliases: ['alumni'],
  },
  {
    path: '/student/profile',
    label: 'Profile',
    group: 'Account',
    what: 'update your details, photo and password, and request a learning mode change',
    aliases: ['account', 'settings', 'my details', 'phone', 'password', 'photo', 'learning mode'],
  },
];

export const ADMIN_PAGES: PortalPage[] = [
  {
    path: '/admin/dashboard',
    label: 'Dashboard',
    group: 'Overview',
    what: 'see what needs a decision and how the portal is being used',
    aliases: ['home', 'overview'],
  },
  {
    path: '/admin/students',
    label: 'Students',
    group: 'People',
    what: 'search every student and open their record',
    aliases: ['student list', 'find a student', 'roll'],
  },
  {
    path: '/admin/admissions',
    label: 'Admissions/Requests',
    group: 'People',
    what: 'approve or reject applications, learning mode changes and certificate name changes',
    aliases: ['admit', 'approve', 'application', 'applications', 'pending', 'name change', 'requests'],
  },
  {
    path: '/admin/courses',
    label: 'Courses',
    group: 'Academics',
    what: 'create courses and assign them to cohorts',
    aliases: ['subject', 'module', 'curriculum'],
  },
  {
    path: '/admin/attendance',
    label: 'Attendance',
    group: 'Academics',
    what: 'open a class for check-in, verify marks and correct the register',
    aliases: ['register', 'class today', 'present', 'absent', 'check in'],
  },
  {
    path: '/admin/assignments',
    label: 'Tasks',
    group: 'Academics',
    what: 'set work, mark submissions and import grades',
    aliases: ['assignment', 'assignments', 'homework', 'coursework', 'mark', 'grading'],
  },
  {
    path: '/admin/exams',
    label: 'Exams',
    group: 'Academics',
    what: 'build exams, manage the question bank, monitor sittings and release results',
    aliases: ['exam', 'paper', 'question bank', 'release results', 'monitor'],
  },
  {
    path: '/admin/practice',
    label: 'Practice Questions',
    group: 'Academics',
    what: 'write, draft and approve the questions students practise against — never exam questions',
    aliases: ['practice', 'practise', 'practice questions', 'quiz', 'quizzes', 'revision questions'],
  },
  {
    path: '/admin/materials',
    label: 'Materials',
    group: 'Academics',
    what: 'upload course materials and target them at a cohort or learning mode',
    aliases: ['upload', 'notes', 'handout', 'resources', 'files'],
  },
  {
    path: '/admin/fees',
    label: 'Fees',
    group: 'Finance',
    what: 'set fee structures, assign fees, waive them and record manual payments',
    aliases: ['fee', 'fee structure', 'waive', 'invoice', 'charge'],
  },
  {
    path: '/admin/payments',
    label: 'Payments',
    group: 'Finance',
    what: 'review submitted receipts and verify or reject them',
    aliases: ['receipt', 'receipts', 'verify', 'proof of payment', 'bank transfer'],
  },
  {
    path: '/admin/announcements',
    label: 'Announcements',
    group: 'Communication',
    what: 'publish notices to students',
    aliases: ['notice', 'broadcast', 'notify'],
  },
  {
    path: '/admin/calendar',
    label: 'Calendar',
    group: 'Communication',
    what: 'schedule classes, events and holidays',
    aliases: ['timetable', 'schedule', 'event', 'holiday'],
  },
  {
    path: '/admin/email-history',
    label: 'Email History',
    group: 'Communication',
    what: 'see every email the portal has sent and resend one',
    aliases: ['email', 'emails', 'sent', 'resend'],
  },
  {
    path: '/admin/analytics',
    label: 'Analytics',
    group: 'Insights',
    what: 'see enrolment, revenue, attendance and how much the portal is being used',
    aliases: ['report', 'reports', 'stats', 'statistics', 'charts', 'engagement', 'views', 'downloads'],
  },
  {
    path: '/admin/audit',
    label: 'Audit Log',
    group: 'Insights',
    what: 'see who changed what, and when',
    aliases: ['history', 'who changed', 'log', 'trail'],
  },
  {
    path: '/admin/storage',
    label: 'Storage',
    group: 'System',
    what: 'browse stored files and check how much space is used',
    aliases: ['files', 'r2', 'bucket', 'space', 'disk'],
  },
  {
    path: '/admin/ai',
    label: 'AI',
    group: 'System',
    what: 'switch AI features on or off, set the providers and the daily caps',
    aliases: ['assistant', 'barnabas', 'model', 'provider', 'openai', 'gemini', 'api key'],
  },
  {
    path: '/admin/settings',
    label: 'Settings',
    group: 'System',
    what: 'manage cohorts, site content, maintenance mode and school-wide settings',
    aliases: ['cohort', 'session', 'maintenance', 'site content', 'seo'],
  },
  {
    path: '/admin/profile',
    label: 'Profile',
    group: 'System',
    what: 'update your own details and password',
    aliases: ['account', 'my details', 'password'],
  },
];

export type Audience = 'student' | 'admin';

export const pagesFor = (audience: Audience): PortalPage[] =>
  audience === 'admin' ? ADMIN_PAGES : STUDENT_PAGES;

/** Words too common to identify a page on their own. */
const STOP_WORDS = new Set([
  'a', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'can', 'do', 'does', 'find', 'for',
  'from', 'get', 'go', 'have', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'see',
  'show', 'that', 'the', 'to', 'view', 'want', 'what', 'when', 'where', 'which', 'who', 'why',
  'with', 'you', 'your', 'page', 'portal', 'site', 'app', 'does', 'need',
]);

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));

export interface PageMatch {
  page: PortalPage;
  score: number;
}

/**
 * The page a question is about, or none.
 *
 * Scored rather than first-match: "where do I download my notes" hits both
 * Materials ("download", "notes") and Certificate ("download"), and the one
 * with more of the question's words in it is the one meant. A multi-word alias
 * counts for more than a single word, because "name on certificate" matching
 * is a far stronger signal than "name" appearing anywhere.
 *
 * Returns nothing below a floor. A confident wrong page is worse than handing
 * the question on to something that can think about it.
 */
export const matchPage = (question: string, audience: Audience): PageMatch | null => {
  const asked = words(question);
  if (asked.length === 0) return null;
  const askedSet = new Set(asked);
  const lower = question.toLowerCase();

  const scored = pagesFor(audience)
    .map((page) => {
      let score = 0;

      // The label is the strongest signal: it is what the sidebar shows.
      words(page.label).forEach((word) => {
        if (askedSet.has(word)) score += 3;
      });

      (page.aliases ?? []).forEach((alias) => {
        const normalised = alias.toLowerCase().trim();
        // Phrase-ness is judged on the raw alias, before stop words are
        // stripped. "check in" and "when is class" both reduce to a single
        // significant word, and treating them as single words made "how do I
        // check in for class" score Attendance and Calendar equally — a tie,
        // which this function correctly refuses to guess between. The alias was
        // never one word; it only looked like one after filtering.
        if (/\s/.test(normalised)) {
          if (lower.includes(normalised)) score += 2 + normalised.split(/\s+/).length;
          return;
        }
        if (askedSet.has(normalised)) score += 2;
      });

      return { page, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 2) return null;

  // A tie is genuine ambiguity, and guessing between two pages is how an
  // assistant sends somebody to the wrong one with total confidence.
  if (scored[1] && scored[1].score === best.score) return null;

  return best;
};

/** Whether a question is asking where something is, rather than for data. */
export const isNavigationalQuestion = (question: string): boolean =>
  /\b(where|how do i|how can i|how to|find|navigate|which page|what page|take me|go to|get to|locate)\b/i.test(
    question,
  );
