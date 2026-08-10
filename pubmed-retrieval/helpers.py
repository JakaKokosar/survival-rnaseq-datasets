import gzip
import json
import pandas as pd

from pathlib import Path
from typing import Generator, Dict, Any


def load_json(file_path: str) -> dict:
    if file_path.endswith('.json'):
        with open(file_path, 'r', encoding='utf-8') as file:
            return json.load(file)
    elif file_path.endswith('.json.gz'):
        with gzip.open(file_path, 'rt', encoding='utf-8') as file:
            return json.load(file)
    else:
        raise ValueError(f'Unsupported file format: {file_path}')


def get_content(file_path: str, sections=['INTRO', 'METHODS', 'RESULTS', 'DISCUSS', 'CONCL']) -> dict:
    """ 
    TITLE and ABSTRACT are stored separately and always included.

    The rest of the sections are optional and can be included or excluded based on the sections parameter.

    Output object format:
    {
        'TITLE': str,
        'ABSTRACT': str,
        'KEYWORDS': list[str],
        'CONTENT': str,
        'FIG_CAPTIONS': str
        'SUPPL': str
    }
    """
    bioC_json = load_json(file_path)
    if 'documents' not in bioC_json:
        bioC_json = {'documents': [bioC_json]}

    # sanity check
    if len(bioC_json['documents']) != 1:
        raise ValueError(f'Expected 1 document, got {len(bioC_json["documents"])}')
    
    doc = bioC_json['documents'][0]

    output = {
        'TITLE': doc['passages'][0]['text'],
        'ABSTRACT': '',
        'KEYWORDS': doc['passages'][0]['infons'].get('kwd', None),
        'CONTENT': None,
        'FIG_CAPTIONS': '',
        'SUPPL': ''
    }

    section_types_to_skip = {'KEYWORD', 'REVIEW_INFO', 'APPENDIX', 'ABBR', 'AUTH_CONT', 
                             'ACK_FUND', 'COMP_INT',  'TABLE', 'REF', 'CASE'} # 'SUPPL'

    content_markdown = ''
    fig_count = 1
    for passage in doc['passages']:
        section_type = passage['infons']['section_type']

        # skip unwanted sections
        if section_type in section_types_to_skip:
            continue

        passage_type = passage['infons']['type']

        if 'abstract' in passage_type:
            output['ABSTRACT'] += passage['text'] + '\n'
            continue

        if 'fig_caption' in passage_type:
            output['FIG_CAPTIONS'] += f"Figure {fig_count}: {passage['text'].strip()}\n"
            fig_count += 1
            continue
    
        if section_type in sections:
            if 'title_1' in passage_type:
                content_markdown += f"# {passage['text'].strip()}\n"
            elif 'title_' in passage_type:
                content_markdown += f"## {passage['text'].strip()}\n"
            elif 'paragraph' in passage_type:
                content_markdown += passage['text'].strip() + "\n\n"
        elif section_type == 'SUPPL':
            output['SUPPL'] += passage['text'].strip() + "\n\n"

    output['CONTENT'] = content_markdown
    return output














































# def passage_iterator(bioc_json_path: str) -> Generator[Dict[str, Any], None, None]:
#     bioCjson = load_json(bioc_json_path)

#     if len(bioCjson['documents']) != 1:
#         raise ValueError(f'Expected 1 document, got {len(bioCjson["documents"])}')

#     doc = bioCjson['documents'][0]

#     section_types_to_skip = {'KEYWORD', 'REVIEW_INFO', 'APPENDIX', 'ABBR', 'AUTH_CONT', 
#                              'ACK_FUND', 'COMP_INT', 'SUPPL', 'TABLE', 'REF', 'CASE'} 

#     for passage in doc['passages']:
#         section_type = passage['infons']['section_type']
#         is_title = 'title' in passage['infons']['type']

#         if section_type not in section_types_to_skip and not is_title:
#             yield passage


# def match_keywords(passage: Dict[str, Any], keywords: list) -> list:
#     text = passage['text'].strip().lower().replace('\xa0', ' ').replace('\n', ' ')
#     for keyword in keywords:
#         return keyword in text
    























































# def map_pmcid_to_filepath() -> dict:
#     file_paths = get_all_file_paths('../data/bioCjson') + get_all_file_paths('../data/EPMC') # + get_all_file_paths('../data/neg_control')
#     return {file.split('/')[-1].replace('.json.gz', ''): file for file in file_paths}


# def get_all_file_paths(dir: str) -> list:
#     df = pd.read_csv('../data/journals.csv')
#     # df_controls = pd.read_csv('../data/negative-control.csv')
#     pmcids = set(df['pmcid'].tolist())  # + df_controls['pmcid'].tolist())
#     return [str(file) for file in Path(dir).rglob('*.json.gz') if file.stem.replace('.json', '') in pmcids]

# def load_json(file_path: str) -> dict:
#     with gzip.open(file_path, 'rt') as file:
#         return json.load(file)


# def read_bioC(bioc_json: dict):
#     if len(bioc_json['documents']) != 1:
#         raise ValueError(f'Expected 1 document, got {len(bioc_json["documents"])}')

#     doc = bioc_json['documents'][0]

#     title = doc['passages'][0]['text']
#     if 'subtitle' in doc['passages'][0]['infons']:
#         title += f": {doc['passages'][0]['infons']['subtitle']}"

#     output = {
#         'title': title,
#         'abstract': '',
#         'keywords': doc['passages'][0]['infons'].get('kwd', None),
#         'content': None
#     }

#     content_markdown = ""
#     for passage in doc['passages']:
#         section_type = passage['infons']['section_type']
#         if section_type in ['ABBR']:
#             continue

#         passage_type = passage['infons']['type']

#         if 'abstract' in passage_type:
#             output['abstract'] += passage['text'] + '\n'
#             continue

#         if 'title_1' in passage_type:
#             content_markdown += f"# {passage['text'].strip()}\n"
#         elif 'title_' in passage_type:
#             content_markdown += f"## {passage['text'].strip()}\n"
#         elif 'paragraph' in passage_type:
#             content_markdown += passage['text'].strip() + "\n\n"

#     output['content'] = content_markdown

#     return output # ['content']


# def get_paper_content(file_path: str):
#     paper_data = load_json(file_path)
#     if 'documents' in paper_data:
#         paper_data = read_bioC(paper_data)

#     return paper_data