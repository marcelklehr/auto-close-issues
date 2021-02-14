const fs = require("fs");
const core = require("@actions/core");
const github = require("@actions/github");
const mdjson = require("mdjson");

const ISSUE_TEMPLATE_DIR = ".github/ISSUE_TEMPLATE";

// Grab the closing message from params or fallback to a default message
const getIssueCloseMessage = () => {
  const message =
    core.getInput("issue-close-message") ||
    "@${issue.user.login}: hello! :wave:\n\nThis issue is being automatically closed because it does not follow the issue template.";

  const { payload } = github.context;

  const builtMessage =  Function(
    ...Object.keys(payload),
    `return \`${message}\``
  )(...Object.values(payload));
  
  console.log('Will write comment:', JSON.stringify(builtMessage));
  
  return builtMessage
};

(async () => {
  const client = new github.GitHub(
    core.getInput("github-token", { required: true })
  );

  const { payload } = github.context;

  const issueBodyMarkdown = payload.issue.body;
  
  console.log({issueBodyMarkdown});
  
  // Get all the markdown titles from the issue body
  const issueBodyTitles = Object.keys(mdjson(issueBodyMarkdown));
  
  console.log({issueBodyTitles});

  // Get a list of the templates
  const issueTemplates = fs.readdirSync(ISSUE_TEMPLATE_DIR);
  
  console.log({issueTemplates});

  // Compare template titles with issue body
  const doesIssueMatchAnyTemplate = issueTemplates.some(template => {
    const templateMarkdown = fs.readFileSync(
      `${ISSUE_TEMPLATE_DIR}/${template}`,
      "utf-8"
    );
    const templateTitles = Object.keys(mdjson(templateMarkdown));
    console.log({template, templateMarkdown, templateTitles})

    return templateTitles.filter(title => issueBodyTitles.includes(title)).length >= 3;
  });
  
  console.log({doesIssueMatchAnyTemplate})

  const { issue } = github.context;
  const closedIssueLabel = core.getInput("closed-issues-label");
  
  console.log({closedIssueLabel})

  if (payload.action !== "opened" && doesIssueMatchAnyTemplate && payload.issue.state === "closed" && closedIssueLabel) {
    console.log('Issue matches a template and is currently closed and there is an issue label')
    // Only reopen the issue if there's a `closed-issues-label` so it knows that
    // it was previously closed because of the wrong template
    const labels = (
      await client.issues.listLabelsOnIssue({
        owner: issue.owner,
        repo: issue.repo,
        issue_number: issue.number
      })
    ).data.map(({ name }) => name);
    
    console.log({labels})

    if (!labels.includes(closedIssueLabel)) {
      console.log('Doing nothing')
      return;
    }

    console.log('Removing label')
    await client.issues.removeLabel({
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number,
      name: closedIssueLabel
    });

    console.log('Reopening issue')
    await client.issues.update({
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number,
      state: "open"
    });

    return;
  }
  
  if (doesIssueMatchAnyTemplate) {
    console.log('Doing nothing')
    return;
  }

  // If an closed issue label was provided, add it to the issue
  if (closedIssueLabel) {
    console.log('Adding label')
    await client.issues.addLabels({
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number,
      labels: [closedIssueLabel]
    });
  }

  // Add the issue closing comment
  console.log('Adding comment')
  await client.issues.createComment({
    owner: issue.owner,
    repo: issue.repo,
    issue_number: issue.number,
    body: getIssueCloseMessage()
  });

  // Close the issue
  console.log('Closing issue')
  await client.issues.update({
    owner: issue.owner,
    repo: issue.repo,
    issue_number: issue.number,
    state: "closed"
  });
})().then(() => {
  console.log('DONE.')
})
.catch(e => {
   console.error(e)
});
