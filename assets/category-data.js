(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = data;
  } else {
    Object.assign(root, data);
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  const CATEGORY_LABELS = {
    stat: "통계",
    method: "연구방법론",
    tool: "측정·도구",
    ethics: "윤리·출판",
    physchem: "물리학·화학",
    bioearth: "생물학·지구과학",
    neuro: "뇌과학·신경과학",
    medhealth: "의학·보건",
    psych: "심리학",
    socialecon: "사회과학·경제학",
    eng: "공학",
    cs: "컴퓨터과학·AI",
    math: "수학",
  };

  const CATEGORY_ORDER = ["stat", "method", "tool", "ethics", "physchem", "bioearth", "neuro", "medhealth", "psych", "socialecon", "eng", "cs", "math"];

  const CATEGORY_DESCRIPTIONS = {
    stat: "평균, 분산, 유의확률처럼 데이터를 요약하고 가설을 검정하는 데 쓰이는 통계 개념을 다룹니다. 논문의 '결과' 섹션에 나오는 숫자와 검정 방법을 해석하려는 사람이 주로 찾습니다.",
    method: "연구를 어떻게 설계하고 진행하는지에 관한 용어를 모았습니다. 종단연구, 질적연구, 메타분석처럼 '이 연구가 어떤 방식으로 이뤄졌는지'를 이해하는 데 필요한 개념입니다.",
    tool: "설문 척도나 신뢰도·타당도처럼 무언가를 측정하기 위한 도구와 그 품질을 평가하는 개념을 다룹니다. 설문 조사나 실험 도구를 직접 설계·평가해야 하는 사람에게 유용합니다.",
    ethics: "동료심사, 출판편향, 이중맹검처럼 연구가 공정하고 신뢰할 수 있게 이뤄지고 발표되도록 하는 절차와 원칙을 다룹니다. 논문의 신뢰성을 판단하려는 독자가 찾아봅니다.",
    physchem: "물리학과 화학의 기초 개념(엔트로피, 촉매, 동위원소 등)을 다룹니다. 자연과학 논문을 읽다가 낯선 물리·화학 용어를 만난 비전공자를 위한 카테고리입니다.",
    bioearth: "생명과학과 지구과학 전반의 용어(유전자 발현, 생물다양성, 판구조론 등)를 모았습니다. 생물학·환경·지구과학 관련 논문이나 뉴스를 이해하려는 사람에게 도움이 됩니다.",
    neuro: "뇌와 신경계의 구조·기능, fMRI·EEG 같은 측정 기법을 다룹니다. 뇌과학 연구나 인지과학 논문을 읽는 학생·연구자가 자주 찾는 카테고리입니다.",
    medhealth: "임상시험, 역학, 유병률처럼 의학·보건 연구에서 쓰이는 용어를 모았습니다. 의학 논문이나 건강 관련 통계 기사를 읽을 때 나오는 개념을 확인하려는 사람에게 유용합니다.",
    psych: "인지편향, 자기효능감처럼 사람의 생각과 행동을 연구할 때 쓰이는 심리학 개념을 다룹니다. 심리학 논문이나 교양서를 읽는 사람이 주로 찾습니다.",
    socialecon: "지니계수, 외부효과처럼 사회 현상과 경제를 분석하는 데 쓰이는 사회과학·경제학 개념을 모았습니다. 정책·경제 관련 논문이나 보고서를 이해하려는 사람에게 도움이 됩니다.",
    eng: "유한요소해석, 신호대잡음비처럼 공학 설계·해석에 쓰이는 개념을 다룹니다. 공학 논문이나 기술 문서를 읽는 학생·실무자를 위한 카테고리입니다.",
    cs: "머신러닝, 신경망, 자연어처리처럼 컴퓨터과학·인공지능 분야의 핵심 개념을 다룹니다. AI 관련 논문이나 기사를 이해하려는 사람이 가장 많이 찾는 카테고리 중 하나입니다.",
    math: "논문 전반에서 배경 지식으로 등장하는 수학 개념을 다룹니다. 통계·공학·CS 용어를 이해하는 데 필요한 기초를 보완하려는 사람에게 유용합니다.",
  };

  // Display order of subcategories within each top-level category.
  // The actual subcategory assignment for each term lives on the term itself
  // (terms.json `subcategory` field), not here — this only controls ordering.
  // A term whose `subcategory` isn't in this list still renders, appended after
  // the known ones in whatever order it's encountered.
  const SUB_CATEGORY_ORDER = {
    stat: ["기술통계·확률분포", "추론통계·가설검정", "회귀·상관분석", "비모수·범주형자료분석", "실험설계·표본추출", "다변량·고급기법"],
    method: ["연구설계", "질적연구", "측정·타당도신뢰도", "문헌연구·메타분석", "데이터수집·표본", "재현성·오픈사이언스"],
    tool: ["통계·분석도구", "설문·척도", "실험기기·측정장비", "소프트웨어·플랫폼"],
    ethics: ["연구윤리 원칙", "출판·저작권", "이해상충·데이터관리", "임상·인간대상연구윤리"],
    physchem: ["역학·에너지", "전자기·파동", "열역학", "화학반응·물질구조", "양자·현대물리", "원소·주기율"],
    bioearth: ["세포·분자생물학", "유전·진화", "생태·환경", "지구시스템·지질", "천문·우주", "생리·발생"],
    neuro: ["신경세포·전달물질", "뇌구조·기능", "인지신경과학", "신경질환", "신경영상·측정기법"],
    medhealth: ["질병·병리", "해부·생리", "역학·공중보건", "치료·약리", "진단·검사", "발달·생애주기건강"],
    psych: ["발달심리", "인지심리", "사회심리", "성격·임상심리", "학습·행동", "심리측정"],
    socialecon: ["미시경제", "거시경제", "사회학·사회구조", "정치·정책", "인류학·문화", "경영·조직"],
    eng: ["전기전자", "기계·재료", "토목·건축", "화학·에너지공학", "산업·시스템", "소프트웨어·제어"],
    cs: ["알고리즘·자료구조", "인공지능·머신러닝", "데이터베이스·시스템", "네트워크·보안", "소프트웨어공학", "이론전산학"],
    math: ["대수·정수론", "해석학·미적분", "확률·조합론", "기하·위상", "응용수학·수치해석", "논리·집합론"],
  };

  return { CATEGORY_LABELS, CATEGORY_ORDER, SUB_CATEGORY_ORDER, CATEGORY_DESCRIPTIONS };
});
