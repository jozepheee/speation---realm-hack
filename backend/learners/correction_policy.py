"""A self-check guides practice; only fresh audio can supply a new assessment."""
def supported_target(content,word):
    return content.get('state')=='tentative_observation' and any(
        item.get('word','').casefold()==word.casefold() and item.get('expected_phone')
        and item.get('category')!='uncertain' for item in content.get('concerns',[]))
