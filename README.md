<p align="center">
  <img src="public/icons/icon-192.png" width="88" alt="미노피아 아이콘">
</p>

<h1 align="center">미노피아</h1>

<p align="center"><b>사람은 승인 세 번, 나머지는 AI 팀.</b><br>휴대폰으로 AI 개발팀을 지휘하는 1인 사무실</p>

<p align="center"><code>미노피아 = 규칙(토큰 0) + 역할을 나눈 AI 팀 + 사람의 승인 3번</code></p>

<p align="center">
  <img src="https://img.shields.io/badge/추가_비용-0원-e07a3a?style=flat-square" alt="추가 비용 0원">
  <img src="https://img.shields.io/badge/사람_승인-3번-3b2a1e?style=flat-square" alt="사람 승인 3번">
  <img src="https://img.shields.io/badge/AI_팀원-7명-4a7bd0?style=flat-square" alt="AI 팀원 7명">
  <img src="https://img.shields.io/badge/코딩_경험-없음-6e5a48?style=flat-square" alt="코딩 경험 없음">
</p>

<p align="center">
  <a href="https://minlab-ai-office.pages.dev/demo"><b>▶ 30초 체험(로그인 없음)</b></a> ·
  <a href="https://minlab-ai-office.pages.dev/portfolio">포트폴리오</a> ·
  <a href="#자주-묻는-것">자주 묻는 것</a>
</p>

<p align="center">
  <img src="docs/screenshots/office.gif" width="720" alt="미노피아 사무실 — 체험 업무가 진행되는 동안 말풍선(조사 → 기획 → 계획 → 개발)이 실제 업무 상태를 따라 바뀝니다">
  <br><sub>데모판에서 녹화한 실제 화면. 캐릭터 위치와 말풍선은 꾸며낸 움직임 없이 업무 상태만 따릅니다.</sub>
</p>

## 한눈에

- **요청은 대화로** — 대화창에 한 줄 쓰면 미니엉이 프로젝트와 담당 AI를 정해 업무로 접수합니다(모델 호출 없음).
- **사람은 결정만** — 기획 승인 → 올리기 승인 → 배포 승인, 휴대폰에서 세 번 누르면 끝까지 갑니다.
- **AI가 AI를 검증** — 결과 하나를 AI 셋이 같은 항목, 다른 관점으로 채점하고, 기준 미달이면 사람에게 오기 전에 다시 개발합니다.
- **확인한 것만 표시** — "배정됨"과 "실행됨"을 나누고, 승인·기획서·결과는 고칠 수 없는 기록으로 남깁니다.
- **0원으로 운영** — 이미 쓰는 구독(Claude, ChatGPT)과 무료 API(Gemini, Exa)만 씁니다.

## 왜 만들었나

> "AI를 효율적으로 쓰고, 토큰을 아끼고, 더 고도화하고 싶었습니다."

AI가 여럿인데 사람이 그 사이를 오가며 글을 옮기고, 같은 설명을 몇 번씩 다시 하고, 결과가 맞는지 혼자 확인했습니다. 코딩을 몰라도 AI에게 일을 맡길 수는 있지만, **맡기는 방식**이 비효율이었습니다.

그래서 사람은 결정만 하고, 나머지는 AI끼리 나눠 하는 사무실을 만들었습니다. 코딩 지식 없이 16일 동안 만들었고, 추가 비용은 0원입니다.

### AI 하나에 다 맡길 때와 무엇이 다른가

| | AI 하나에 다 맡기기 | 미노피아 |
| --- | --- | --- |
| 사람이 하는 일 | AI 사이를 오가며 글 옮기기, 결과 직접 확인 | 요청과 승인 세 번 |
| 접수·배정·알림 | 매번 AI에게 물어봄(토큰) | 규칙으로 처리(토큰 0) |
| 결과 확인 | 만든 AI가 스스로 "됐어요" | 다른 AI 셋이 같은 기준으로 채점 |
| 기록 | 대화창에 흩어짐 | 승인·기획서·결과를 고칠 수 없는 기록으로 |
| 비용 | 쓸수록 늘어남 | 추가 0원 |

## AI 팀원 소개

<table>
<tr>
<td align="center" width="14%"><img src="src/assets/office/characters/mina-stand.png" height="72" alt="미니엉"><br><b>미니엉</b><br><sub>접수</sub></td>
<td align="center" width="14%"><img src="src/assets/office/characters/claude-stand.png" height="72" alt="Claude"><br><b>Claude</b><br><sub>PM·기획 + 보조 개발</sub></td>
<td align="center" width="14%"><img src="src/assets/office/characters/codex-stand.png" height="72" alt="Codex"><br><b>Codex</b><br><sub>주 개발</sub></td>
<td align="center" width="14%"><img src="src/assets/office/characters/studioA-stand.png" height="72" alt="Studio A"><br><b>Studio A</b><br><sub>Gemini · 채점①</sub></td>
<td align="center" width="14%"><img src="src/assets/office/characters/studioB-stand.png" height="72" alt="Studio B"><br><b>Studio B</b><br><sub>Gemini · 채점②</sub></td>
<td align="center" width="14%"><img src="src/assets/office/characters/exa-stand.png" height="72" alt="Exa"><br><b>Exa</b><br><sub>웹 조사</sub></td>
<td align="center" width="14%"><img src="src/assets/office/characters/ci-stand.png" height="72" alt="미노"><br><b>미노</b><br><sub>검수·배포</sub></td>
</tr>
<tr>
<td valign="top"><sub>말을 받아 넘기고 승인을 알림. <b>규칙으로만</b> 움직여 토큰 0</sub></td>
<td valign="top"><sub>요청을 기획서와 작업으로 나눔. Codex가 못 하면 대신 개발하고 PR을 엶</sub></td>
<td valign="top"><sub>Linear로 업무를 받아 클라우드에서 개발·시험</sub></td>
<td valign="top"><sub><b>요청·사용자</b> 관점으로 채점, 질문 답. 무료 키 A</sub></td>
<td valign="top"><sub><b>코드 품질·안전</b> 관점으로 채점. 무료 키 B</sub></td>
<td valign="top"><sub>웹에서 글을 찾아 오면 Gemini가 정리</sub></td>
<td valign="top"><sub>GitHub Actions에서 검사·배포, 구조도·앱 지도</sub></td>
</tr>
</table>

## 업무 하나 따라가기

데모판의 체험 업무("로그인 버튼 색 바꾸기") 하나가 지나가는 길입니다. 사람이 누르는 것은 굵은 화살표 세 번뿐입니다.

```mermaid
sequenceDiagram
    actor O as 소유자(휴대폰)
    participant M as 미니엉(규칙)
    participant G as Gemini A·B
    participant C as Claude(PM)
    participant X as Codex
    participant N as 미노(Actions)
    O->>M: "로그인 버튼 색을 주황색으로 바꿔 줘"
    M->>G: 접수·배정(모델 호출 없음)
    G-->>O: 기획서 초안
    O->>C: ① 기획 승인 (실행 승인은 자동 기록)
    C->>X: 작업으로 나눠 맡김
    X-->>G: 결과(바뀐 코드·시험 기록)
    G-->>O: 3중 평가 — A 96 · B 91 · Claude 94 → 평균 94
    O->>N: ② 올리기 승인
    N-->>O: PR 열고 시험·빌드 통과
    O->>N: ③ 배포 승인
    N-->>O: 운영 반영
```

평균이나 과반이 80점 미만이면 사람에게 오기 전에 자동으로 다시 개발합니다. 승인·기획서·결과는 **고칠 수 없는 기록**으로 쌓이고, DB가 순서를 지킵니다.

| 대화로 요청 | 3중 평가 | AI 팀 근무·휴가 |
| --- | --- | --- |
| <img src="docs/screenshots/chat.jpg" alt="대화창에서 요청하고 승인 알림을 받는 화면" width="260" /> | <img src="docs/screenshots/review.png" alt="Gemini A·B와 Claude의 점수와 평균" width="260" /> | <img src="docs/screenshots/team.png" alt="팀 관리에서 AI별 근무·휴가를 정하는 화면" width="260" /> |

## 결정 기록

코딩을 몰라도 판단은 제가 했습니다. 막히면 직접 시험해 보고 방향을 바꿨습니다.

| 문제 | 시도 | 결과 | 결정 |
| --- | --- | --- | --- |
| 무료 Gemini로 웹 검색 | 무료 키로 모델 24개를 직접 시험 | 모두 실패 | 검색은 Exa, 정리는 Gemini로 나눔. 안 될 땐 누를 때만 Claude |
| 지시서가 길어 토큰 낭비 | 늘 지킬 규칙을 각 저장소로 옮김 | 4,144자 → 909자 | 지시서에는 할 일만 |
| 결과가 맞는지 혼자 확인 | AI 하나로 채점 | 한 관점만 봄 | 같은 항목, 다른 관점 3중 평가 + 기준 미달은 자동 다시 개발 |
| "배정됨"과 "실행됨"이 섞임 | 상태를 화면에만 표시 | 확인 안 된 상태가 보임 | 확인한 상태와 출처만 표시, 승인 순서는 DB가 지킴 |
| 안 쓰이는 AI·기능 | 써 보며 기록 | Grok·"Gemini 쉬운 개발"은 한 번도 안 쓰임 | 뺌 |

그 밖에 AI가 꺼내 쓰는 작업 설명서(스킬) 13개를 11개 프로젝트에 넣었고, 배포할 때마다 버전 노트가 Obsidian 지식 그래프에 자동으로 쌓입니다.

## 바꾼 효과

| | 전 | 후 |
| --- | --- | --- |
| 지시서 길이 | 4,144자 | **909자** |
| 사람이 누르는 승인 | 기획·실행·올리기·배포 4번 | **3번** (실행 승인은 기획 승인에 포함해 자동 기록) |
| 채점 | AI 하나 | **AI 셋**(관점이 다른 Gemini 둘 + 동료 개발 AI) |
| 추가 비용 | — | **0원** |

## 16일 동안 쌓은 것

| 16일 | 397 | 224 | 3.1만 줄 | 500 | 29 | 56 | 14 | 0원 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 2026.10.29 → 11.13 | 합친 변경(PR) | 버전 기록 | 코드 | 자동 시험 | 서버 함수 | DB 변경 기록 | 관리하는 프로젝트 | 추가 비용 |

숫자는 저장소와 운영 DB 기록에서 센 값입니다(2026-11-13, [포트폴리오](https://minlab-ai-office.pages.dev/portfolio)와 같음). 앱 대부분은 Claude와 대화하며 만들었습니다. 앱 안에서 요청부터 배포까지 끝까지 돈 업무는 아직 3건이고, 지금도 실제로 쓰면서 검증하고 있습니다.

## 데모 직접 써 보기

[데모판](https://minlab-ai-office.pages.dev/demo)은 실제 앱 주소의 체험 모드입니다. 로그인 없이, 예시 데이터로 보는 기기 안에서만 돌아갑니다.

'체험 업무 시작'을 누르면 정해진 업무 하나가 생기고, AI·서버 몫(기획서 초안 → 개발 → 3중 평가 → PR 검사)은 브라우저 안에서 채워집니다. 소유자 몫인 승인 세 번만 직접 누르면 끝까지 갑니다. 실제 서버·AI는 부르지 않습니다.

## 새 소식

- **v0.7.11** — Exa 웹 검색이 안 될 때 누르면 Claude가 대신 찾아 주는 [Claude에게 찾아보기]
- **v0.7.10** — 웹 조사는 Exa만(무료 키로 안 되던 Gemini 검색 연결은 지움)
- **v0.7.9** — 팀 관리에서 Exa에게도 휴가를 줄 수 있음
- **v0.7.8** — 코드 3중 평가: Gemini A·B + 동료 개발 AI, 각 점수와 평균

전체 기록은 [변경 기록](CHANGELOG.md)에 있습니다.

## 자주 묻는 것

**코딩을 몰라도 만들 수 있었나요?**
네. 앱 대부분은 Claude와 대화하며 만들었습니다. 저는 무엇을 만들지 정하고, 결과를 보고, 승인하고, 안 되면 방향을 바꿨습니다.

**정말 추가 비용이 0원인가요?**
네. 유료 API와 크레딧은 쓰지 않는 것이 규칙입니다. Claude·ChatGPT는 원래 쓰던 구독 안에서, Gemini·Exa는 무료 사용량 안에서만 씁니다.

**AI가 멋대로 배포하지는 않나요?**
아닙니다. 운영 배포는 사람의 배포 승인 뒤에만 됩니다. 승인 순서는 화면뿐 아니라 DB가 막고, 시험(CI)을 통과해야 배포 승인 버튼이 켜집니다.

**데모는 진짜로 AI가 도나요?**
아닙니다. 데모판은 보는 기기 안에서 정해진 내용으로 흐름만 보여 줍니다. 실제 서버와 AI는 부르지 않습니다.

## 앞으로

- 프로젝트별 채팅방(Discord처럼 AI가 직접 말하는 방)
- Gemini 두 개가 각각 시안을 그리고 서로 평가한 뒤 사람이 고르기
- 다른 사람도 쓸 수 있는 버전

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| 화면 | React 18, TypeScript, Vite, PWA(휴대폰 홈 화면) |
| 서버 | Supabase(PostgreSQL, RLS, Auth, Realtime, Storage), Edge Functions(Deno) |
| AI 연결 | Claude Code 루틴, Codex(Linear), Gemini API 무료 키, Exa |
| 검사·배포 | GitHub Actions(타입 검사·시험·빌드·DB 시험·함수 배포), Cloudflare Pages |
| 시험 | Vitest, 로컬 PostgreSQL DB 시험, Playwright 화면 확인(휴대폰 400px·데스크톱 1400px) |

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
