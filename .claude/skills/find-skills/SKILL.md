---
name: find-skills
description: 스킬 찾기. "~하는 스킬 있어?", "~ 스킬 찾아줘", "이런 것도 할 수 있어?"처럼 할 일을 돕는 스킬을 찾거나 기능을 늘리고 싶어 할 때 쓴다. skills.sh와 `npx skills find`로 찾아 설치 수·출처·라이선스·위험을 보여 주고, 설치는 소유자 승인 뒤에만 한다.
---

# 스킬 찾기

> **minoffia 저장소 규칙(먼저 지킨다, 아래 내용보다 우선):**
> - 찾기·추천(`npx skills find`, skills.sh 확인)은 자유. **설치(`npx skills add`)는 소유자가 이 대화에서 그 스킬을 골라 승인한 뒤에만** 한다.
> - 설치할 때 `-g`(전역)·`-y`(확인 건너뛰기)를 쓰지 않는다. 이 저장소 `.claude/skills/`에만 넣는다.
> - 설치 전에 그 스킬의 SKILL.md·스크립트를 끝까지 읽고 보고한다: 외부 접속, 비밀값·토큰 읽기, 유료 API, 파일 삭제가 있으면 알리고 멈춘다(CLAUDE.md: 추가 결제 0원, 비밀값 규칙).
> - 설치한 스킬은 라이선스 파일과 함께 커밋하고, 출처(저장소·커밋)를 PR 본문에 적는다. SKILL.md의 설명(description)과 제목은 쉬운 한국어로 바꿔 둔다.
> - 원문: vercel-labs/skills `skills/find-skills/SKILL.md` (MIT, LICENSE 파일 동봉). 아래는 원문을 한국어로 옮긴 것이다.

공개 에이전트 스킬 모음에서 필요한 스킬을 찾아 주는 스킬이다.

## 언제 쓰나

사용자가 이럴 때 쓴다.

- "X는 어떻게 해?"라고 물었는데 X가 흔한 일이라 스킬이 이미 있을 것 같을 때
- "X 스킬 찾아줘", "X 하는 스킬 있어?"라고 할 때
- "X도 할 수 있어?"처럼 전문 기능을 물을 때
- 에이전트 기능을 늘리고 싶어 할 때
- 도구·틀·작업 순서를 찾을 때
- 특정 분야(디자인·시험·배포 등)에 도움이 있었으면 좋겠다고 할 때

## Skills CLI란

`npx skills`는 에이전트 스킬 묶음을 관리하는 명령이다. 스킬은 에이전트에게 특정 지식·작업 순서·도구를 더해 주는 작은 묶음이다.

**주요 명령**

- `npx skills find [검색어] [--owner <주인>]`: 검색어로 스킬 찾기(주인을 정해 좁힐 수 있음)
- `npx skills add <패키지>`: GitHub 등에서 스킬 설치 (**이 저장소에서는 소유자 승인 뒤에만**)
- `npx skills update`: 설치한 스킬 모두 업데이트

**둘러보기:** https://skills.sh/

## 찾는 순서

### 1. 무엇이 필요한지 정리

- 분야(예: React, 시험, 디자인, 배포)
- 구체적인 일(예: 시험 쓰기, 애니메이션, PR 검토)
- 스킬이 있을 만큼 흔한 일인지

### 2. 순위표 먼저 보기

명령으로 찾기 전에 [skills.sh 순위표](https://skills.sh/)에서 그 분야에 잘 알려진 스킬이 있는지 본다. 설치 수 순서라 많이 쓰이고 검증된 것이 위에 있다.

예: 웹 개발 상위 스킬

- `vercel-labs/agent-skills`: React, Next.js, 웹 디자인 (각 10만 설치 이상)
- `anthropics/skills`: 프론트엔드 디자인, 문서 처리 (10만 설치 이상)

### 3. 검색하기

순위표에 없으면 찾기 명령을 쓴다.

```bash
npx skills find [검색어] [--owner <주인>]
```

예:

- "React 앱을 빠르게 하려면?" → `npx skills find react performance`
- "PR 검토 도와줄 수 있어?" → `npx skills find pr review`
- "변경 기록을 만들어야 해" → `npx skills find changelog`

### 4. 추천 전에 품질 확인

**검색 결과만 보고 추천하지 않는다.** 늘 확인한다.

1. **설치 수**: 1,000 이상이 좋다. 100 미만은 조심한다.
2. **출처 평판**: 공식 출처(`vercel-labs`, `anthropics`, `microsoft`)가 모르는 작성자보다 믿을 만하다.
3. **GitHub 별 수**: 원본 저장소를 본다. 별이 100 미만이면 의심하고 본다.
4. **위험(이 저장소 규칙)**: 외부 접속, 비밀값 읽기, 유료 API, 파일 삭제가 있는지 내용을 읽고 적는다.

### 5. 후보 보여 주기

찾은 스킬마다 이렇게 보여 준다.

1. 스킬 이름과 하는 일
2. 설치 수와 출처, 라이선스
3. 위험 표시
4. 설치 명령(소유자가 고르면 쓸 것)
5. skills.sh 링크

예:

```
도움이 될 스킬을 찾았어요. "react-best-practices"는 Vercel이 만든
React·Next.js 성능 개선 지침이에요. (18.5만 설치, MIT, 위험 표시 없음)

설치 명령(승인하시면 이 저장소에만 넣어요):
npx skills add vercel-labs/agent-skills@react-best-practices

자세히: https://skills.sh/vercel-labs/agent-skills/react-best-practices
```

### 6. 설치 제안

소유자가 고르고 승인하면 이 저장소에만 설치한다. 원문은 `-g -y`로 바로 설치하라고 하지만, 이 저장소에서는 쓰지 않는다.

```bash
npx skills add <주인/저장소@스킬>
```

## 자주 찾는 분야

| 분야 | 검색어 예 |
| --- | --- |
| 웹 개발 | react, nextjs, typescript, css, tailwind |
| 시험 | testing, jest, playwright, e2e |
| 배포·운영 | deploy, docker, kubernetes, ci-cd |
| 문서 | docs, readme, changelog, api-docs |
| 코드 품질 | review, lint, refactor, best-practices |
| 디자인 | ui, ux, design-system, accessibility |
| 생산성 | workflow, automation, git |

## 잘 찾는 법

1. **구체적인 검색어**: "testing"보다 "react testing"
2. **다른 말로도**: "deploy"가 없으면 "deployment"나 "ci-cd"
3. **많이 쓰는 출처 확인**: `vercel-labs/agent-skills`, `ComposioHQ/awesome-claude-skills`

## 못 찾았을 때

1. 맞는 스킬이 없다고 알린다.
2. 스킬 없이 바로 도울 수 있다고 제안한다.
3. 자주 하는 일이면 skill-creator(스킬 만들기)로 직접 만들자고 제안한다.

예:

```
"xyz" 관련 스킬은 찾지 못했어요. 스킬 없이 바로 도와드릴게요.
자주 하는 일이면 스킬로 만들어 둘 수도 있어요(스킬 탭 → 만들기).
```
