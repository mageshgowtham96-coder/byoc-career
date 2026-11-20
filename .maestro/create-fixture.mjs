import { mkdir, writeFile } from 'node:fs/promises';
import {
  Document, Header, Footer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, HeadingLevel, AlignmentType, Packer
} from 'docx';

const cell = (text, bold = false) => new TableCell({
  width: { size: 50, type: WidthType.PERCENTAGE },
  children: [new Paragraph({ children: [new TextRun({ text, bold })] })]
});

const doc = new Document({
  creator: 'BYOC Android E2E',
  title: 'BYOC DOCX Import Regression Fixture',
  sections: [{
    properties: {},
    headers: { default: new Header({ children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: 'BYOC E2E Candidate | Platform Operations', bold: true })]
    })] }) },
    footers: { default: new Footer({ children: [new Paragraph('Confidential career profile — test fixture')] }) },
    children: [
      new Paragraph({ text: 'BYOC E2E Candidate', heading: HeadingLevel.TITLE }),
      new Paragraph('Platform Operations & Customer Support Specialist'),
      new Paragraph({ text: 'Professional Summary', heading: HeadingLevel.HEADING_1 }),
      new Paragraph('Operations professional with experience supporting customers, coordinating service workflows, documenting incidents and improving response quality.'),
      new Paragraph({ text: 'Experience', heading: HeadingLevel.HEADING_1 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [cell('Role', true), cell('Evidence', true)] }),
          new TableRow({ children: [cell('Customer Support Associate'), cell('Resolved customer issues and documented case outcomes.')] }),
          new TableRow({ children: [cell('Operations Coordinator'), cell('Coordinated schedules, escalations and service reporting.')] })
        ]
      }),
      new Paragraph({ text: 'Selected Achievements', heading: HeadingLevel.HEADING_2 }),
      new Paragraph('Maintained accurate case records and escalated complex incidents.'),
      new Paragraph('Collaborated with technical teams to resolve recurring service issues.'),
      new Paragraph({ text: 'Skills', heading: HeadingLevel.HEADING_1 }),
      new Paragraph('Customer Support | Incident Management | Excel | Documentation | Communication'),
      new Paragraph({ text: 'Education', heading: HeadingLevel.HEADING_1 }),
      new Paragraph('Bachelor of Commerce — Example University, 2022')
    ]
  }]
});
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/byoc-e2e-resume.docx', await Packer.toBuffer(doc));
