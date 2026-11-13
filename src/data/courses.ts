/** The published curriculum, shared by the Courses page and the home page. */
export interface CurriculumCourse {
  code: string;
  title: string;
}

export const basicCourses: CurriculumCourse[] = [
  { code: "SLSM101", title: "The Canon of Scriptures" },
  { code: "SLSM102", title: "The Basic Bible Interpretation" },
  { code: "SLSM103", title: "The Basic Bible Doctrines" },
  { code: "SLSM104", title: "The Concept of Ministry" },
  { code: "SLSM105", title: "Spiritual Maturing" },
  { code: "SLSM106", title: "The Principle of Honor" },
  { code: "SLSM107", title: "Church Conflict Management & Resolution" },
  { code: "SLSM108", title: "The Biblical Concept of Leadership" },
  { code: "SLSM109", title: "Ministerial Ethics" },
  { code: "SLSM110", title: "Balancing Marriage and Ministry" },
  { code: "SLSM111", title: "Ministry and Marketplace" },
];

export const advancedCourses: CurriculumCourse[] = [
  { code: "SLSM201", title: "Advanced Hermeneutics" },
  { code: "SLSM202", title: "Systematic Theology" },
  { code: "SLSM203", title: "Pastoral Counseling" },
  { code: "SLSM204", title: "Church Administration & Governance" },
  { code: "SLSM205", title: "Missions & Evangelism Strategy" },
  { code: "SLSM206", title: "Homiletics & Sermon Delivery" },
  { code: "SLSM207", title: "Spiritual Warfare & Deliverance" },
  { code: "SLSM208", title: "Christian Education & Discipleship" },
];
