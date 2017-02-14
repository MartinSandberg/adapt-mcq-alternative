define(function (require) {
    var QuestionView = require('coreViews/questionView');
    var Adapt = require('coreJS/adapt');

    var McqAlternative = QuestionView.extend({
        events: {
            'focus .mcq-alternative-item input': 'onItemFocus',
            'blur .mcq-alternative-item input': 'onItemBlur',
            'change .mcq-alternative-item input': 'onItemSelected',
            'keyup .mcq-alternative-item input': 'onKeyPress',
            'click .mcq-alternative-popup-done': 'closePopup'
        },
        resetQuestionOnRevisit: function () {
            this.setAllItemsEnabled(true);
            this.resetQuestion();
        },
        setupQuestion: function () {
            // if only one answer is selectable, we should display radio buttons not checkboxes
            this.model.set("_isRadio", (this.model.get("_selectable") == 1));

            this.model.set('_selectedItems', []);

            this.setupQuestionItemIndexes();

            this.setupRandomisation();

            this.restoreUserAnswers();
        },
        setupQuestionItemIndexes: function () {
            var items = this.model.get("_items");
            if (items && items.length > 0) {
                for (var i = 0, l = items.length; i < l; i++) {
                    if (items[i]._index === undefined)
                        items[i]._index = i;
                }
            }
        },
        setupRandomisation: function () {
            if (this.model.get('_isRandom') && this.model.get('_isEnabled')) {
                this.model.set("_items", _.shuffle(this.model.get("_items")));
            }
        },
        restoreUserAnswers: function () {
            if (!this.model.get("_isSubmitted"))
                return;

            var selectedItems = [];
            var items = this.model.get("_items");
            var userAnswer = this.model.get("_userAnswer");
            _.each(items, function (item, index) {
                item._isSelected = userAnswer[item._index];
                if (item._isSelected) {
                    selectedItems.push(item)
                }
            });

            this.model.set("_selectedItems", selectedItems);

            this.setQuestionAsSubmitted();
            this.markQuestion();
            this.setScore();
            this.showMarking();
            this.setupFeedback();
        },
        disableQuestion: function () {
            this.setAllItemsEnabled(false);
        },
        enableQuestion: function () {
            this.setAllItemsEnabled(true);
        },
        setAllItemsEnabled: function (isEnabled) {
            _.each(this.model.get('_items'), function (item, index) {
                var $itemLabel = this.$('label').eq(index);
                var $itemInput = this.$('input').eq(index);

                if (isEnabled) {
                    $itemLabel.removeClass('disabled');
                    $itemInput.prop('disabled', false);
                } else {
                    $itemLabel.addClass('disabled');
                    $itemInput.prop('disabled', true);
                }
            }, this);
        },
        onQuestionRendered: function () {
            this.setReadyStatus();
        },
        onKeyPress: function (event) {
            if (event.which === 13) { //<ENTER> keypress
                this.onItemSelected(event);
            }
        },
        onItemFocus: function (event) {
            if (this.model.get('_isEnabled') && !this.model.get('_isSubmitted')) {
                $("label[for='" + $(event.currentTarget).attr('id') + "']").addClass('highlighted');
            }
        },
        onItemBlur: function (event) {
            $("label[for='" + $(event.currentTarget).attr('id') + "']").removeClass('highlighted');
        },
        onItemSelected: function (event) {
            if (this.model.get('_isEnabled') && !this.model.get('_isSubmitted')) {
                var selectedItemObject = this.model.get('_items')[$(event.currentTarget).parent('.component-item').index()];
                this.toggleItemSelected(selectedItemObject, event);
            }
        },
        toggleItemSelected: function (item, clickEvent) {
            var selectedItems = this.model.get('_selectedItems');
            var itemIndex = _.indexOf(this.model.get('_items'), item),
                    $itemLabel = this.$('label').eq(itemIndex),
                    $itemInput = this.$('input').eq(itemIndex),
                    selected = !$itemLabel.hasClass('selected');

            if (selected) {
                if (this.model.get('_selectable') === 1) {
                    this.$('label').removeClass('selected');
                    this.$('input').prop('checked', false);
                    this.deselectAllItems();
                    selectedItems[0] = item;
                } else if (selectedItems.length < this.model.get('_selectable')) {
                    selectedItems.push(item);
                } else {
                    clickEvent.preventDefault();
                    return;
                }
                $itemLabel.addClass('selected');
                $itemLabel.a11y_selected(true);
            } else {
                selectedItems.splice(_.indexOf(selectedItems, item), 1);
                $itemLabel.removeClass('selected');
                $itemLabel.a11y_selected(false);
            }
            $itemInput.prop('checked', selected);
            item._isSelected = selected;
            this.model.set('_selectedItems', selectedItems);
        },
        // check if the user is allowed to submit the question
        canSubmit: function () {
            var count = 0;

            _.each(this.model.get('_items'), function (item) {
                if (item._isSelected) {
                    count++;
                }
            }, this);

            return (count > 0) ? true : false;

        },
        // Blank method to add functionality for when the user cannot submit
        // Could be used for a popup or explanation dialog/hint
        onCannotSubmit: function () {},
        // This is important for returning or showing the users answer
        // This should preserve the state of the users answers
        storeUserAnswer: function () {
            var userAnswer = [];

            var items = this.model.get('_items').slice(0);
            items.sort(function (a, b) {
                return a._index - b._index;
            });

            _.each(items, function (item, index) {
                userAnswer.push(item._isSelected);
            }, this);
            this.model.set('_userAnswer', userAnswer);
        },
        isCorrect: function () {

            var numberOfRequiredAnswers = 0;
            var numberOfCorrectAnswers = 0;
            var numberOfIncorrectAnswers = 0;

            _.each(this.model.get('_items'), function (item, index) {

                var itemSelected = (item._isSelected || false);

                if (item._shouldBeSelected) {
                    numberOfRequiredAnswers++;

                    if (itemSelected) {
                        numberOfCorrectAnswers++;

                        item._isCorrect = true;

                        this.model.set('_isAtLeastOneCorrectSelection', true);
                    }

                } else if (!item._shouldBeSelected && itemSelected) {
                    numberOfIncorrectAnswers++;
                }

            }, this);

            this.model.set('_numberOfCorrectAnswers', numberOfCorrectAnswers);
            this.model.set('_numberOfRequiredAnswers', numberOfRequiredAnswers);

            // Check if correct answers matches correct items and there are no incorrect selections
            var answeredCorrectly = (numberOfCorrectAnswers === numberOfRequiredAnswers) && (numberOfIncorrectAnswers === 0);
            return answeredCorrectly;
        },
        // Sets the score based upon the questionWeight
        // Can be overwritten if the question needs to set the score in a different way
        setScore: function () {
            var questionWeight = this.model.get("_questionWeight");
            var answeredCorrectly = this.model.get('_isCorrect');
            var score = answeredCorrectly ? questionWeight : 0;
            this.model.set('_score', score);
        },
        setupFeedback: function () {
            if (this.model.get('_isCorrect')) {
                this.setupCorrectFeedback();
            } else if (this.isPartlyCorrect()) {
                this.setupPartlyCorrectFeedback();
            } else {
                // apply individual item feedback
                if ((this.model.get('_selectable') === 1) && this.model.get('_selectedItems')[0].feedback) {
                    this.setupIndividualFeedback(this.model.get('_selectedItems')[0]);
                    return;
                } else {
                    this.setupIncorrectFeedback();
                }
            }

        },
        
        // This is important and should give the user feedback on how they answered the question
        // Normally done through ticks and crosses by adding classes
        showMarking: function () {
            if (!this.model.get('_canShowMarking'))
                return;

            _.each(this.model.get('_items'), function (item, i) {
                var $item = this.$('.component-item').eq(i);
                $item.removeClass('correct incorrect').addClass(item._isCorrect ? 'correct' : 'incorrect');
            }, this);
        },
        isPartlyCorrect: function () {
            return this.model.get('_isAtLeastOneCorrectSelection');
        },
        resetUserAnswer: function () {
            this.model.set({_userAnswer: []});
        },
        // Used by the question view to reset the look and feel of the component.
        resetQuestion: function () {

            this.deselectAllItems();
            this.resetItems();
        },
        deselectAllItems: function () {
            this.$el.a11y_selected(false);
            _.each(this.model.get('_items'), function (item) {
                item._isSelected = false;
            }, this);
        },
        resetItems: function () {
            this.$('.component-item label').removeClass('selected');
            this.$('.component-item').removeClass('correct incorrect');
            this.$('input').prop('checked', false);
            this.model.set({
                _selectedItems: [],
                _isAtLeastOneCorrectSelection: false
            });
        },
        showCorrectAnswer: function () {
            _.each(this.model.get('_items'), function (item, index) {
                this.setOptionSelected(index, item._shouldBeSelected);
            }, this);
        },
        setOptionSelected: function (index, selected) {
            var $itemLabel = this.$('label').eq(index);
            var $itemInput = this.$('input').eq(index);
            if (selected) {
                $itemLabel.addClass('selected');
                $itemInput.prop('checked', true);
            } else {
                $itemLabel.removeClass('selected');
                $itemInput.prop('checked', false);
            }
        },
        hideCorrectAnswer: function () {
            _.each(this.model.get('_items'), function (item, index) {
                this.setOptionSelected(index, this.model.get('_userAnswer')[item._index]);
            }, this);
        },
        /**
         * used by adapt-contrib-spoor to get the user's answers in the format required by the cmi.interactions.n.student_response data field
         * returns the user's answers as a string in the format "1,5,2"
         */
        getResponse: function () {
            var selected = _.where(this.model.get('_items'), {'_isSelected': true});
            var selectedIndexes = _.pluck(selected, '_index');
            // indexes are 0-based, we need them to be 1-based for cmi.interactions
            for (var i = 0, count = selectedIndexes.length; i < count; i++) {
                selectedIndexes[i]++;
            }
            return selectedIndexes.join(',');
        },
        /**
         * used by adapt-contrib-spoor to get the type of this question in the format required by the cmi.interactions.n.type data field
         */
        getResponseType: function () {
            return "choice";
        },
        // additional functions for internalk popup
        closePopup: function (event) {
            if (event)
                event.preventDefault();

            this.$('.mcq-alternative-popup').hide();

            this.isPopupOpen = false;
            
            // do not trigger as this will make the page jump around on IE11
            //Adapt.trigger('popup:closed', this.$('.mcq-alternativ-popup-inner'));
        },
        setupIndividualFeedback: function (selectedItem) {
            var thefeedbackTitle = this.model.get('title');
            var thefeedbackMessage = selectedItem.feedback;

            this.model.set({
                feedbackTitle: thefeedbackTitle,
                feedbackMessage: thefeedbackMessage
            });
        },
        // overriding the standard function since we don't want Tutor to be triggered
        onSubmitClicked: function () {
            // canSubmit is setup in questions and should return a boolean
            // If the question stops the user form submitting - show instruction error
            // and give a blank method, onCannotSubmit to the question
            var canSubmit = this._runModelCompatibleFunction("canSubmit");

            if (!canSubmit) {
                this.showInstructionError();
                this.onCannotSubmit();
                return;
            }

            // Used to update the amount of attempts the question has
            this._runModelCompatibleFunction("updateAttempts");

            // Used to set attributes on the model after being submitted
            // Also adds a class of submitted
            this._runModelCompatibleFunction("setQuestionAsSubmitted");

            // Used to remove instruction error that is set when
            // the user has interacted in the wrong way
            this.removeInstructionError();

            // Used to store the users answer for later
            // This is a blank method given to the question
            this._runModelCompatibleFunction("storeUserAnswer");

            // Used to set question as correct:true/false
            // Calls isCorrect which is blank for the question
            // to fill out and return a boolean
            this._runModelCompatibleFunction("markQuestion", "isCorrect");

            // Used by the question to set the score on the model
            this._runModelCompatibleFunction("setScore");

            // Used by the question to display markings on the component
            this.showMarking();

            // Used to check if the question is complete
            // Triggers setCompletionStatus and adds class to widget
            this._runModelCompatibleFunction("checkQuestionCompletion");

            this.recordInteraction();

            // Used to setup the feedback by checking against
            // question isCorrect or isPartlyCorrect
            this._runModelCompatibleFunction("setupFeedback");

            // Used to update buttonsView based upon question state
            // Update buttons happens before showFeedback to preserve tabindexes and after setupFeedback to allow buttons to use feedback attribute
            this._runModelCompatibleFunction("updateButtons");

            // Used to trigger an event so plugins can display feedback
            this.showFeedback();

            this.onSubmitted();
        },
        showFeedback: function () {
            if (this.model.get('_canShowFeedback')) {
                var feedbackTitle = this.model.get('feedbackTitle');
                var thefeedbackMessage = this.model.get('feedbackMessage');

                this.$('.mcq-alternative-content-title').html(feedbackTitle);
                this.$('.mcq-alternative-content-body').html(thefeedbackMessage);



                this.$('.mcq-alternative-popup').show();
                this.$('.mcq-alternative-popup-inner .active').a11y_on(true);

                this.isPopupOpen = true;
                
                // Do not trigger this as it will trigger movement of the page in IE11
                //Adapt.trigger('popup:opened', this.$('.mcq-alternative-popup-inner'));

                this.$('.mcq-alternative-popup-inner .active').a11y_focus();

                this.setupEscapeKey();
            }
        },
        setupEscapeKey: function () {
            var hasAccessibility = Adapt.config.has('_accessibility') && Adapt.config.get('_accessibility')._isActive;

            if (!hasAccessibility && this.isPopupOpen) {
                $(window).on("keyup", this.onKeyUp);
            } else {
                $(window).off("keyup", this.onKeyUp);
            }
        },
        onAccessibilityToggle: function () {
            this.setupEscapeKey();
        },
        onKeyUp: function (event) {
            if (event.which != 27)
                return;

            event.preventDefault();

            this.closePopup();
        }
    });

    Adapt.register("mcq-alternative", McqAlternative);

    return McqAlternative;
});
