import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { decodeXml, docxLines, extractOffice, officeToText, sheetRows, slideText } from './office';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

describe('DOCX', () => {
  it('제목·목록·표·특수문자를 글로 옮긴다', async () => {
    const xml = `<?xml version="1.0"?><w:document ${W}><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>결제 화면</w:t></w:r></w:p>
      <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">카드 </w:t></w:r><w:r><w:t>&amp; 계좌</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>항목</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>값</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:sectPr/></w:body></w:document>`;
    const zip = new JSZip();
    zip.file('word/document.xml', xml);
    const o = await extractOffice((await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }))) as never, 'docx');
    expect(o.lines).toContain('# 결제 화면');
    expect(o.lines).toContain('- 카드 & 계좌');
    expect(o.lines).toContain('항목 | 값');
  });

  it('본문이 없으면 오류', async () => {
    const zip = await JSZip.loadAsync(await new JSZip().generateAsync({ type: 'uint8array' }));
    await expect(extractOffice(zip as never, 'docx')).rejects.toThrow('DOCX');
  });

  it('docxLines는 빈 줄을 하나로 줄인다', () => {
    expect(docxLines(`<w:body><w:p/><w:p/><w:p><w:r><w:t>a</w:t></w:r></w:p></w:body>`)).toEqual(['a']);
  });
});

describe('PPTX', () => {
  it('슬라이드 번호 순서대로(10이 2 뒤)', async () => {
    const zip = new JSZip();
    const slide = (t: string) => `<p:sld><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p><a:p><a:r><a:t>둘째 줄</a:t></a:r></a:p></p:txBody></p:sld>`;
    zip.file('ppt/slides/slide10.xml', slide('열'));
    zip.file('ppt/slides/slide2.xml', slide('둘'));
    zip.file('ppt/slides/slide1.xml', slide('하나'));
    const o = await extractOffice((await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }))) as never, 'pptx');
    expect(o.slides!.map((s) => s.split('\n')[0])).toEqual(['하나', '둘', '열']);
    expect(slideText('<a:p><a:r><a:t>x &lt; y</a:t></a:r></a:p>')).toBe('x < y');
  });
});

describe('XLSX', () => {
  it('공유 문자열·숫자·인라인·빈 칸 위치를 지킨다', async () => {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="매출 &amp; 비용" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/sharedStrings.xml', '<sst><si><t>이름</t></si><si><r><t>금</t></r><r><t>액</t></r></si></sst>');
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>커피</t></is></c><c r="C2"><v>4500</v></c></row></sheetData></worksheet>',
    );
    const o = await extractOffice((await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }))) as never, 'xlsx');
    expect(o.sheets![0].name).toBe('매출 & 비용');
    expect(o.sheets![0].rows).toEqual([
      ['이름', '', '금액'],
      ['커피', '', '4500'],
    ]);
    expect(officeToText(o)).toContain('## 시트: 매출 & 비용\n이름\t\t금액');
  });

  it('행 상한을 넘으면 잘렸다고 표시', () => {
    const xml = Array.from({ length: 205 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`).join('');
    const r = sheetRows(xml, []);
    expect(r.rows.length).toBe(200);
    expect(r.truncated).toBe(true);
  });
});

describe('공통', () => {
  it('엔터티 풀기, 요약 글 길이 상한', () => {
    expect(decodeXml('&#xAC00;&#44032;&amp;lt;')).toBe('가가&lt;');
    expect(officeToText({ kind: 'docx', lines: ['가'.repeat(50)] }, 10)).toContain('…(뒤는 잘림)');
  });
});
