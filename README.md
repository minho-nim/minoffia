# 미노피아 (minoffia)

> 휴대폰으로 AI 개발팀을 지휘하는 1인 사무실. 사람은 요청하고 승인 세 번만 누르고, 기획·개발·채점·검사·배포는 역할을 나눈 AI들이 합니다.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-F38020?logo=cloudflarepages&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?logo=githubactions&logoColor=white)
![추가 비용](https://img.shields.io/badge/추가_비용-0원-orange)

**[포트폴리오 페이지](https://minlab-ai-office.pages.dev/portfolio)** · **[데모 직접 써 보기(로그인 없음)](https://minlab-ai-office.pages.dev/demo)**

![미노피아 사무실 화면 — 캐릭터 위치와 말풍선이 실제 업무 상태를 따라 움직입니다](docs/screenshots/office.jpg)

## 왜 만들었나

> "AI를 효율적으로 쓰고, 토큰을 아끼고, 더 고도화하고 싶었습니다."

AI가 여럿인데 사람이 그 사이를 오가며 글을 옮기고, 같은 설명을 몇 번씩 다시 하고, 결과가 맞는지 혼자 확인했습니다. 코딩을 몰라도 AI에게 일을 맡길 수는 있지만, **맡기는 방식**이 비효율이었습니다.

그래서 사람은 결정만 하고, 나머지는 AI끼리 나눠 하는 사무실을 만들었습니다. 코딩 지식 없이 16일 동안 만들었고, 추가 비용은 0원입니다.

## 어떻게 돌아가나

```text
요청(소유자) → 기획(Claude) → [기획 승인] → 개발(Codex·Claude) → 채점(Gemini A·B + 동료 AI)
            → [올리기 승인] → PR·검사(미노) → [배포 승인] → 배포(미노)
```

대괄호가 소유자의 승인 세 번입니다. 실행 승인은 기획 승인에 포함해 앱이 자동으로 기록합니다. 승인·기획서·결과는 **고칠 수 없는 기록**으로 쌓이고, DB가 순서를 지킵니다.

| 담당 | 역할 | 하는 일 |
| --- | --- | --- |
| 미니엉 | 접수 | 대화창의 얼굴. 말을 받아 넘기고 승인을 알립니다. 규칙으로만 움직여 토큰을 쓰지 않습니다. |
| Claude | PM·기획 + 보조 개발 | 요청을 기획서와 작업으로 나눕니다. Codex가 못 하면 대신 개발하고 PR을 엽니다. |
| Codex | 주 개발 | Linear로 업무를 받아 클라우드에서 개발·시험하고 결과를 보냅니다. |
| Studio A·B | Gemini · 채점 | 같은 항목을 다른 관점(요청·사용자 / 코드 품질·안전)으로 채점하고, 질문에 답합니다. 무료 키 2개. |
| Exa | 웹 조사 | 웹에서 글을 찾아 오면 Gemini가 정리합니다. |
| 미노 | 검수 · 구조도·앱 지도 | GitHub Actions에서 검사·배포를 하고, 바뀐 곳 구조도와 앱 지도를 만듭니다. |

| 대화로 요청 | 3중 평가 | AI 팀 근무·휴가 |
| --- | --- | --- |
| <img src="docs/screenshots/chat.jpg" alt="대화창에서 요청하고 승인 알림을 받는 화면" width="260" /> | <img src="docs/screenshots/review.png" alt="Gemini A·B와 Claude의 점수와 평균" width="260" /> | <img src="docs/screenshots/team.png" alt="팀 관리에서 AI별 근무·휴가를 정하는 화면" width="260" /> |

## 부딪힌 문제와 방향 바꾸기

- **승인은 기록으로 남기기**: "배정했다"와 "실행됐다"를 나눠서, 확인한 것만 화면에 보여 줍니다. 승인 순서는 화면뿐 아니라 DB 게이트로도 지킵니다.
- **토큰 아끼기**: 늘 지킬 규칙은 각 저장소에 두고, 지시서에는 할 일만 쓰게 바꿨습니다. 지시서가 4,144자에서 909자로 줄었습니다. 판단할 수 있는 건 AI를 부르지 않고 규칙으로 처리합니다.
- **실패에서 방향 바꾸기**: 무료 Gemini 키로 웹 검색이 되는지 모델 24개를 직접 시험했고, 모두 안 됐습니다. 그래서 검색은 Exa가 하고 정리는 Gemini가 하도록 나눴습니다. 써 보니 안 쓰이던 Grok과 "Gemini 쉬운 개발"은 뺐습니다.
- **AI가 AI를 검증하기**: 결과 하나를 Gemini 두 개와 개발한 AI의 짝(Codex↔Claude)이 같은 항목으로 채점합니다. 평균이나 과반이 기준 미만이면 자동으로 다시 개발하고, 나머지는 사람이 점수를 보고 정합니다.
- **일하는 방법도 쌓기**: AI가 꺼내 쓰는 작업 설명서(스킬) 13개를 만들어 11개 프로젝트에 넣었습니다. 어떤 스킬을 썼는지 결과에 남깁니다.
- **기억 남기기**: 배포할 때마다 버전 노트가 Obsidian 지식 그래프에 자동으로 쌓이고, 버전마다 만든 AI와 쓴 스킬로 이어집니다.

## 16일 동안 쌓은 것

| 16일 | 397 | 224 | 3.1만 줄 | 500 | 29 | 56 | 14 | 0원 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 2026.10.29 → 11.13 | 합친 변경(PR) | 버전 기록 | 코드 | 자동 시험 | 서버 함수 | DB 변경 기록 | 관리하는 프로젝트 | 추가 비용 |

숫자는 저장소와 운영 DB 기록에서 센 값입니다(2026-11-13, [포트폴리오](https://minlab-ai-office.pages.dev/portfolio)와 같음). 앱 대부분은 Claude와 대화하며 만들었습니다. 앱 안에서 요청부터 배포까지 끝까지 돈 업무는 아직 3건이고, 지금도 실제로 쓰면서 검증하고 있습니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| 화면 | React 18, TypeScript, Vite, PWA(휴대폰 홈 화면) |
| 서버 | Supabase(PostgreSQL, RLS, Auth, Realtime, Storage), Edge Functions(Deno) |
| AI 연결 | Claude Code 루틴, Codex(Linear), Gemini API 무료 키, Exa |
| 검사·배포 | GitHub Actions(타입 검사·시험·빌드·DB 시험·함수 배포), Cloudflare Pages |
| 시험 | Vitest, 로컬 PostgreSQL DB 시험, Playwright 화면 확인(휴대폰 400px·데스크톱 1400px) |

## 지켜 온 원칙

- **추가 결제 0원**: 이미 쓰는 구독과 무료 API만 씁니다. 유료 API·크레딧은 쓰지 않습니다.
- **비밀값은 서버에만**: 키는 서버 secrets에만 두고, 화면·로그·커밋에는 남기지 않습니다.
- **사람은 결정만**: 확인한 상태와 출처만 보여 주고, 승인과 결과는 고칠 수 없는 기록으로 남깁니다.

## 데모 직접 써 보기

[데모판](https://minlab-ai-office.pages.dev/demo)은 실제 앱 주소의 체험 모드입니다. 로그인 없이, 예시 데이터로 보는 기기 안에서만 돌아갑니다.

'체험 업무 시작'을 누르면 정해진 업무 하나가 생기고, AI·서버 몫(기획서 초안 → 개발 → 3중 평가 → PR 검사)은 브라우저 안에서 채워집니다. 소유자 몫인 승인 세 번만 직접 누르면 끝까지 갑니다. 실제 서버·AI는 부르지 않습니다.

## 앞으로

- 프로젝트별 채팅방(Discord처럼 AI가 직접 말하는 방)
- Gemini 두 개가 각각 시안을 그리고 서로 평가한 뒤 사람이 고르기
- 다른 사람도 쓸 수 있는 버전

## 문서

| 문서 | 내용 |
| --- | --- |
| [설치·운영 안내](docs/SETUP.md) | 로컬 실행, Supabase·Claude 루틴·Cloudflare 연결 |
| [업무 흐름](docs/FLOW.md) | 승인 단계, 평가, 배포 |
| [구조](docs/ARCHITECTURE.md) | 화면·서버 함수·DB 구조 |
| [현재 상태](docs/STATUS.md) | 아직 안 된 것·검증 안 된 것 |
| [변경 기록](CHANGELOG.md) | 버전별 변경 |

---

[포트폴리오](https://minlab-ai-office.pages.dev/portfolio) · [데모](https://minlab-ai-office.pages.dev/demo) · [설치](docs/SETUP.md) · [흐름](docs/FLOW.md) · [구조](docs/ARCHITECTURE.md)
