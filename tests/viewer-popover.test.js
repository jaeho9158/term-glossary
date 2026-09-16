const assert = require("assert");
const { popoverHTML } = require("../assets/viewer.js");

// 1) 한글명·영문명·한 줄 정의·상세 링크가 모두 들어간다
{
  const html = popoverHTML(
    {
      slug: "p-value",
      title_ko: "유의확률",
      title_en: "p-value",
      definition: "지금 관찰된 결과가 우연히 나왔을 가능성을 나타내는 숫자입니다.",
    },
    []
  );
  assert.ok(html.includes("유의확률"), "한글명을 보여줘야 한다");
  assert.ok(html.includes("(p-value)"), "영문명을 괄호로 보여줘야 한다");
  assert.ok(
    html.includes("지금 관찰된 결과가 우연히 나왔을 가능성을 나타내는 숫자입니다."),
    "한 줄 정의를 보여줘야 한다"
  );
  assert.ok(html.includes('href="terms/p-value.html"'), "상세 페이지로 링크해야 한다");
  assert.ok(html.includes('target="_blank"'), "상세 링크는 새 탭으로 열어야 한다");
}

// 2) 정의가 없으면 정의 문단 자체를 만들지 않는다
{
  const html = popoverHTML({ slug: "x", title_ko: "테스트", title_en: "" }, []);
  assert.ok(!html.includes("dict-popover-definition"), "정의 문단이 없어야 한다");
  assert.ok(!html.includes("dict-popover-covered"), "겹친 용어 목록이 없어야 한다");
}

// 3) data-covers로 겹친 용어들은 작은 목록으로 덧붙는다
{
  const html = popoverHTML(
    { slug: "a", title_ko: "가", title_en: "", definition: "정의" },
    [
      { slug: "b", title_ko: "나" },
      { slug: "c", title_ko: "다" },
    ]
  );
  assert.ok(html.includes("dict-popover-covered"), "겹친 용어 목록을 렌더해야 한다");
  assert.ok(html.includes('href="terms/b.html"') && html.includes("나"), "겹친 용어 b를 링크해야 한다");
  assert.ok(html.includes('href="terms/c.html"') && html.includes("다"), "겹친 용어 c를 링크해야 한다");
}

// 3-1) 겹친 목록에 자기 자신이 들어 있으면 중복이므로 빼고 보여준다
{
  const html = popoverHTML({ slug: "a", title_ko: "가" }, [{ slug: "a", title_ko: "가" }]);
  assert.ok(!html.includes("dict-popover-covered"), "자기 자신만 겹쳤다면 목록을 만들지 않아야 한다");
}

// 4) 모든 텍스트는 escapeHtml로 이스케이프된다
{
  const html = popoverHTML(
    { slug: "x", title_ko: '<b>이름</b>', title_en: 'a & "b"', definition: "a < b & \"c\"" },
    [{ slug: "y", title_ko: "<i>겹침</i>" }]
  );
  assert.ok(html.includes("a &lt; b &amp; &quot;c&quot;"), "정의의 <, &, \"를 이스케이프해야 한다");
  assert.ok(html.includes("&lt;b&gt;이름&lt;/b&gt;"), "한글명을 이스케이프해야 한다");
  assert.ok(html.includes("&lt;i&gt;겹침&lt;/i&gt;"), "겹친 용어명을 이스케이프해야 한다");
  assert.ok(!html.includes("<b>이름</b>"), "이스케이프되지 않은 원문이 남으면 안 된다");
}

// 5) title_ko가 없으면 slug로 대체한다 (데이터가 비어도 빈 팝오버가 뜨지 않도록)
{
  const html = popoverHTML({ slug: "only-slug" }, []);
  assert.ok(html.includes("only-slug"), "title_ko가 없으면 slug를 보여줘야 한다");
}

console.log("popoverHTML: all tests passed");
