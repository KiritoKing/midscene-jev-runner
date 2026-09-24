export interface Section {
  id: string;
  heading: string;
  level: 2 | 3;
  paragraphs: readonly string[];
}

export interface Article {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  updated: string;
  size: string;
  keywords: readonly string[];
  introduction: readonly string[];
  sections: readonly Section[];
  related: readonly string[];
}

const godelSections: readonly Section[] = [
  {
    id: 'Formal_systems',
    heading: 'Formal systems',
    level: 2,
    paragraphs: [
      'A formal system begins with a language, a collection of axioms, and rules that say which statements follow from earlier ones. A proof is a finite sequence of statements satisfying those rules. The incompleteness theorems concern systems whose proofs can be checked by a mechanical procedure and which can express elementary arithmetic.',
      'The relevant distinctions are easy to confuse: a system is consistent if it does not prove a contradiction, complete if it settles every statement in its language, and sound if its theorems are true in the intended interpretation. Gödel’s results relate these properties under precise assumptions.',
    ],
  },
  {
    id: 'Effective_axiomatization',
    heading: 'Effective axiomatization',
    level: 3,
    paragraphs: [
      'An effective axiomatization makes the axioms and valid proof steps mechanically recognizable. This condition gives a precise meaning to a formal method whose theorems can be enumerated, even if finding a proof may take arbitrarily long.',
    ],
  },
  {
    id: 'Completeness',
    heading: 'Completeness',
    level: 3,
    paragraphs: [
      'Syntactic completeness means that for each sentence in the language, either it or its negation can be proved. It differs from the completeness of first-order logic, which says that every logically valid formula has a proof. The latter is the subject of Gödel’s completeness theorem.',
    ],
  },
  {
    id: 'Consistency',
    heading: 'Consistency',
    level: 3,
    paragraphs: [
      'If a system proves both a sentence and its negation, ordinary rules of classical logic allow every sentence to be derived. Consistency therefore provides the essential nontriviality condition for the first theorem.',
    ],
  },
  {
    id: 'Systems_which_contain_arithmetic',
    heading: 'Systems which contain arithmetic',
    level: 3,
    paragraphs: [
      'The system must represent enough arithmetic to describe finite strings, computations and proofs. Peano arithmetic is a familiar example. Very weak systems can evade the hypotheses, so the conclusion does not apply to every collection of axioms.',
    ],
  },
  {
    id: 'First_incompleteness_theorem',
    heading: 'First incompleteness theorem',
    level: 2,
    paragraphs: [
      'Every consistent, effectively axiomatized formal system capable of expressing a sufficient portion of arithmetic leaves some arithmetical statements undecided: it proves neither the statement nor its negation. The theorem does not identify a universal sentence that works in every possible system; the construction depends on the system being studied.',
      'Gödel encoded symbols, formulas and proofs by natural numbers. This lets arithmetic make assertions about the existence of proofs. Through diagonalization, one obtains a sentence closely related to “this sentence is not provable in this system.”',
    ],
  },
  {
    id: 'Godel_sentence',
    heading: 'Syntactic form of the Gödel sentence',
    level: 3,
    paragraphs: [
      'A Gödel sentence G can be arranged to assert that no number codes a proof of G in the chosen theory T. Its formal content is arithmetical rather than an ordinary English paradox. The exact consistency assumptions needed depend on the formulation of the theorem.',
    ],
  },
  {
    id: 'Second_incompleteness_theorem',
    heading: 'Second incompleteness theorem',
    level: 2,
    paragraphs: [
      'A sufficiently strong and consistent formal theory cannot establish its own consistency using only its own axioms, when consistency is expressed in the usual arithmetical way. The result concerns formal proofs within the theory; it does not say that mathematicians can never have reasons to trust a theory.',
      'The second theorem requires care about how a theory represents provability. Standard derivability conditions connect proofs in the theory with statements inside the theory about those proofs.',
    ],
  },
  {
    id: 'Examples_of_undecidable_statements',
    heading: 'Examples of undecidable statements',
    level: 2,
    paragraphs: [
      'Some statements independent of a particular theory become provable or refutable after its axioms are strengthened. The Paris–Harrington theorem gives a natural combinatorial example independent of Peano arithmetic, assuming the latter is consistent.',
    ],
  },
  {
    id: 'Relationship_with_computability',
    heading: 'Relationship with computability',
    level: 2,
    paragraphs: [
      'Incompleteness is closely connected with the undecidability of the halting problem. Both show limits on general mechanical procedures, though one is phrased in terms of formal proof and the other in terms of computation.',
    ],
  },
  {
    id: 'Proof_sketch_for_the_first_theorem',
    heading: 'Proof sketch for the first theorem',
    level: 2,
    paragraphs: [
      'The proof first arithmetizes syntax, then defines a relation expressing that a number codes a proof. A diagonal lemma supplies a sentence that, within the formal theory, refers to its own lack of a proof. The consistency hypotheses complete the argument.',
    ],
  },
  {
    id: 'Discussion_and_implications',
    heading: 'Discussion and implications',
    level: 2,
    paragraphs: [
      'The theorems helped reshape the study of mathematical foundations. They set limits on Hilbert’s proposed program while leaving open many productive forms of formal reasoning, proof theory and computer-assisted mathematics. They do not imply that all truth is relative or that every mathematical question is undecidable.',
    ],
  },
  {
    id: 'History',
    heading: 'History',
    level: 2,
    paragraphs: [
      'Kurt Gödel announced the results in 1930 and published the proof in 1931. The work arrived amid intense interest in formal foundations, alongside research by Hilbert, Tarski, Church and Turing. Later formulations refined both the assumptions and the reach of the theorems.',
    ],
  },
];

export const articles: readonly Article[] = [
  {
    id: 'mary-mallon',
    title: 'Mary Mallon',
    subtitle: 'Irish-born cook associated with typhoid fever outbreaks',
    description:
      'Mary Mallon, often called Typhoid Mary, was an asymptomatic carrier of typhoid fever whose case raised questions about public health and individual liberty.',
    updated: '20 September 2026',
    size: '16 KB (2,120 words)',
    keywords: ['mary', 'mallon', 'typhoid', 'public health', 'disease'],
    introduction: [
      'Mary Mallon (1869–1938) was an Irish-born cook in the United States. Investigators associated her work in several households with outbreaks of typhoid fever although she did not show symptoms herself.',
      'Her case became a prominent example in debates over asymptomatic carriers, public health orders and the rights of people subject to isolation.',
    ],
    sections: [
      {
        id: 'Investigation',
        heading: 'Investigation',
        level: 2,
        paragraphs: [
          'Public health investigators traced several illnesses to households where Mallon had worked as a cook. The evidence and the methods used to collect it were contested at the time.',
        ],
      },
      {
        id: 'Isolation',
        heading: 'Isolation',
        level: 2,
        paragraphs: [
          'Mallon spent years in isolation on North Brother Island. Her treatment remains a subject of historical discussion because officials had to weigh disease prevention against personal freedom.',
        ],
      },
      {
        id: 'Legacy',
        heading: 'Legacy',
        level: 2,
        paragraphs: [
          'The story helped shape public understanding of symptom-free infection and prompted lasting questions about stigma, uncertainty and proportionate health measures.',
        ],
      },
    ],
    related: ['kurt-godel'],
  },
  {
    id: 'punjab-legislative-assembly',
    title: 'Punjab Legislative Assembly',
    subtitle: 'Legislative body of the Indian state of Punjab',
    description:
      'The Punjab Legislative Assembly has 117 directly elected constituencies in the Indian state of Punjab.',
    updated: '18 September 2026',
    size: '20 KB (2,810 words)',
    keywords: ['punjab', 'legislative', 'assembly', 'constituencies', 'india'],
    introduction: [
      'The Punjab Legislative Assembly is the lawmaking body of the Indian state of Punjab. Its 117 members are directly elected from single-seat constituencies.',
      'Constituency records describe districts, reservation status and electoral history. This local article gives a short overview; it does not provide a current electoral register.',
    ],
    sections: [
      {
        id: 'Constituencies',
        heading: 'Constituencies',
        level: 2,
        paragraphs: [
          'Each assembly constituency elects one member. Constituencies are grouped by district, and some seats are reserved under election law.',
        ],
      },
      {
        id: 'Terms_and_elections',
        heading: 'Terms and elections',
        level: 2,
        paragraphs: [
          'Members normally serve terms of up to five years unless the assembly is dissolved earlier. Electoral data changes over time and is outside this offline preview.',
        ],
      },
    ],
    related: [],
  },
  {
    id: 'godel-incompleteness',
    title: "Gödel's incompleteness theorems",
    subtitle: 'Two theorems in mathematical logic',
    description:
      "Gödel's incompleteness theorems are two theorems of mathematical logic concerning the limits of provability in formal axiomatic theories.",
    updated: '19 August 2026',
    size: '92 KB (12,168 words)',
    keywords: [
      'godel',
      'gödel',
      'incompleteness',
      'theorems',
      'logic',
      'mathematics',
      'formal systems',
      'provability',
    ],
    introduction: [
      "Gödel's incompleteness theorems are two theorems of mathematical logic that concern the limits of provability in formal axiomatic theories. Kurt Gödel published them in 1931, changing how mathematicians understand formal foundations.",
      'Informally, the first theorem says that a consistent formal system rich enough for arithmetic cannot decide every arithmetical statement. The second says that such a system cannot prove its own consistency by its ordinary internal means. The hypotheses matter: neither claim applies to every formal language or every mathematical theory.',
      'The results have an important relationship with computability, the philosophy of mathematics and Hilbert’s program. They are sometimes confused with Gödel’s earlier completeness theorem, a separate result about first-order logic.',
    ],
    sections: godelSections,
    related: [
      'godel-completeness',
      'kurt-godel',
      'formal-system',
      'tarski-undefinability',
      'halting-problem',
    ],
  },
  {
    id: 'godel-completeness',
    title: "Gödel's completeness theorem",
    subtitle: 'Theorem about first-order logic',
    description:
      'A fundamental result connecting logical validity with formal provability in first-order logic.',
    updated: '28 August 2026',
    size: '18 KB (2,402 words)',
    keywords: [
      'godel',
      'gödel',
      'completeness',
      'theorem',
      'logic',
      'first order',
      'provability',
    ],
    introduction: [
      "Gödel's completeness theorem establishes that every logically valid formula of first-order logic can be derived by a suitable proof system. It concerns the logic itself, rather than the completeness of an arithmetic theory.",
      'The distinction matters because first-order logic can be complete while a particular effectively axiomatized theory expressed in it remains incomplete.',
    ],
    sections: [
      {
        id: 'Statement',
        heading: 'Statement',
        level: 2,
        paragraphs: [
          'If a sentence follows from a set of first-order premises in every model, there is a formal derivation of the sentence from those premises. This is often summarized as the equivalence of semantic consequence and syntactic consequence.',
        ],
      },
      {
        id: 'Relationship_to_incompleteness',
        heading: 'Relationship to incompleteness',
        level: 2,
        paragraphs: [
          "Gödel's incompleteness theorems concern specific formal theories able to express arithmetic. Logical completeness does not guarantee that such a theory decides every statement in its language.",
        ],
      },
      {
        id: 'History',
        heading: 'History',
        level: 2,
        paragraphs: [
          'Gödel proved the theorem in his doctoral dissertation in 1929. Subsequent model-theoretic proofs placed it at the center of mathematical logic.',
        ],
      },
    ],
    related: ['godel-incompleteness', 'formal-system', 'tarski-undefinability'],
  },
  {
    id: 'tarski-undefinability',
    title: "Tarski's undefinability theorem",
    subtitle: 'Result about truth in arithmetic',
    description:
      'The truth of arithmetic cannot be defined within arithmetic itself under the usual assumptions.',
    updated: '27 April 2026',
    size: '17 KB (2,398 words)',
    keywords: [
      'tarski',
      'undefinability',
      'theorem',
      'logic',
      'arithmetic',
      'truth',
      'godel',
    ],
    introduction: [
      "Tarski's undefinability theorem places a limit on definitions of truth for arithmetic within the same formal language. It is related to self-reference techniques that also appear in incompleteness arguments.",
      'A language can discuss the truth of a simpler language from outside it; the difficulty arises when the language attempts to define its own full truth predicate.',
    ],
    sections: [
      {
        id: 'Statement',
        heading: 'Statement',
        level: 2,
        paragraphs: [
          'No arithmetical formula defines exactly the set of true sentences of arithmetic in the standard natural numbers. The theorem depends on a precise definition of truth and on the expressive resources of arithmetic.',
        ],
      },
      {
        id: 'Relationship_to_Godel',
        heading: 'Relationship to Gödel',
        level: 2,
        paragraphs: [
          "Gödel's method encodes syntax with numbers. Tarski used related diagonal reasoning to show a further limit on internal definitions of truth.",
        ],
      },
    ],
    related: ['godel-incompleteness', 'godel-completeness'],
  },
  {
    id: 'kurt-godel',
    title: 'Kurt Gödel',
    subtitle: 'Austrian-American logician and mathematician',
    description:
      'Kurt Gödel (1906–1978) was a logician whose work transformed mathematical logic and set theory.',
    updated: '21 September 2026',
    size: '57 KB (6,011 words)',
    keywords: [
      'kurt',
      'godel',
      'gödel',
      'logic',
      'incompleteness',
      'mathematician',
    ],
    introduction: [
      'Kurt Gödel was an Austrian-American logician, mathematician and philosopher. His incompleteness theorems are among the best-known results of twentieth-century logic.',
      'He also proved the completeness theorem for first-order logic and made major contributions to set theory.',
    ],
    sections: [
      {
        id: 'Early_life',
        heading: 'Early life and education',
        level: 2,
        paragraphs: [
          'Gödel studied at the University of Vienna during a period of rapid change in the foundations of mathematics.',
        ],
      },
      {
        id: 'Incompleteness_theorems',
        heading: 'Incompleteness theorems',
        level: 2,
        paragraphs: [
          'His 1931 paper showed that certain formal systems cannot be both consistent and syntactically complete. The proof used arithmetization and self-reference in a rigorous new way.',
        ],
      },
      {
        id: 'Later_work',
        heading: 'Later work',
        level: 2,
        paragraphs: [
          'After moving to the United States, Gödel worked at the Institute for Advanced Study and continued research in logic and philosophy.',
        ],
      },
    ],
    related: ['godel-incompleteness', 'godel-completeness'],
  },
  {
    id: 'formal-system',
    title: 'Formal system',
    subtitle: 'Framework for deriving statements',
    description:
      'A formal system consists of a language, axioms and rules of inference used to derive theorems.',
    updated: '7 September 2026',
    size: '24 KB (3,151 words)',
    keywords: [
      'formal',
      'system',
      'axioms',
      'proof',
      'logic',
      'incompleteness',
    ],
    introduction: [
      'A formal system is an abstract framework for representing statements and checking proofs. Its ingredients include an alphabet, formation rules, axioms and rules of inference.',
      'Questions about consistency, completeness and computability of formal systems are central to mathematical logic.',
    ],
    sections: [
      {
        id: 'Components',
        heading: 'Components',
        level: 2,
        paragraphs: [
          'Symbols form well-formed formulas according to syntactic rules. Axioms provide starting points, while inference rules specify valid proof steps.',
        ],
      },
      {
        id: 'Properties',
        heading: 'Properties',
        level: 2,
        paragraphs: [
          'A formal system may be consistent without being complete. The strength and effectiveness of its axioms determine which metamathematical results apply.',
        ],
      },
    ],
    related: ['godel-incompleteness', 'godel-completeness'],
  },
  {
    id: 'halting-problem',
    title: 'Halting problem',
    subtitle: 'Decision problem in computability theory',
    description:
      'The halting problem asks whether an arbitrary program eventually stops for a given input.',
    updated: '14 September 2026',
    size: '31 KB (4,442 words)',
    keywords: [
      'halting',
      'problem',
      'computability',
      'logic',
      'undecidability',
      'incompleteness',
    ],
    introduction: [
      'The halting problem is the problem of determining whether a given program eventually stops when supplied with an input. Alan Turing showed there is no general algorithm that decides every instance.',
      'The argument is related to diagonal methods used in logic, while its immediate subject is computation.',
    ],
    sections: [
      {
        id: 'Proof_outline',
        heading: 'Proof outline',
        level: 2,
        paragraphs: [
          'A hypothetical universal halting tester can be made to contradict its own prediction by applying it to a specially constructed program.',
        ],
      },
      {
        id: 'Consequences',
        heading: 'Consequences',
        level: 2,
        paragraphs: [
          'The result places a fundamental limit on automated program analysis and connects with undecidable questions in mathematics.',
        ],
      },
    ],
    related: ['godel-incompleteness', 'formal-system'],
  },
];

export function articleById(id: string): Article | undefined {
  return articles.find((article) => article.id === id);
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function searchArticles(query: string): Article[] {
  const words = normalized(query).match(/[a-z0-9]+/g) ?? [];
  const uniqueWords = [...new Set(words.filter((word) => word.length > 2))];
  if (uniqueWords.length === 0) return [];
  return articles
    .map((article) => {
      const title = normalized(article.title);
      const description = normalized(article.description);
      const keywords = normalized(article.keywords.join(' '));
      const score = uniqueWords.reduce((total, word) => {
        return (
          total +
          (title.includes(word) ? 8 : 0) +
          (keywords.includes(word) ? 3 : 0) +
          (description.includes(word) ? 1 : 0)
        );
      }, 0);
      return { article, score };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.article.title.localeCompare(b.article.title),
    )
    .map(({ article }) => article);
}
