const BLOCKED_START = 'BLOCKED changed from [false] to [true]';
const BLOCKED_END = 'BLOCKED changed from [true] to [false]';

var startBlocked;
var endBlocked;

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    _artifacts:[],

    launch: function() {
        var today = new Date().toISOString();
        var me = this;
        // var selectedReleaseRef = me.down('#release-combobox').getRecord().get('_ref');
        // var storeFilters = me._getFilters(selectedReleaseRef);

        //TODO: Change to Artifact store to handle defects as well
        var artifacts = Ext.create('Rally.data.wsapi.Store', {
            model: 'UserStory',
            fetch: ['ObjectID', 'FormattedID','Name','RevisionHistory','Revisions','Description','User'],
            autoLoad: true,
            // filters: storeFilters
        });
        artifacts.load().then({
            success: this._getRevHistoryModel,
            scope: this
        }).then({
            success: this._onRevHistoryModelCreated,
            scope: this
        }).then({
            success: this._onModelLoaded,
            scope: this
        }).then({
            success: this._stitchDataTogether,
            scope: this
        }).then({
            success: this._getBlockedItems,
            scope: this
        }).then({
            success:function(results) {
                me._addReleaseCombo();
                me._makeGrid(results);
            },
            failure: function(){
                console.log("oh noes!");
            }
        });
    },
    _getRevHistoryModel:function(artifacts){
        this._artifacts = artifacts;
        return Rally.data.ModelFactory.getModel({
            type: 'RevisionHistory'
        });
    },
  _onRevHistoryModelCreated: function(model) {
    // console.log('Revision history model: ', model);
    var promises = [];
    _.each(this._artifacts, function(artifact){
      var ref = artifact.get('RevisionHistory')._ref;
    //   console.log(artifact.get('FormattedID'), ref);
        promises.push(model.load(Rally.util.Ref.getOidFromRef(ref)));
    }); 
    return Deft.Promise.all(promises);  
   },
    _onModelLoaded: function (histories) {
        // console.log('Revision histories: ', histories);
        var promises = [];
        _.each(histories, function (history) {
            var revisions = history.get('Revisions');
            revisions.store = history.getCollection('Revisions', { fetch: ['User', 'Description', 'CreationDate', 'RevisionNumber'] });
            promises.push(revisions.store.load());
        });
        return Deft.Promise.all(promises);
    },
    _stitchDataTogether: function (revhistories) {
        // console.log('Stories with rev histories: ', revhistories);
        var me = this;
        var promises = [];
        _.each(me._artifacts, function (artifact) {
            promises.push({ artifact: artifact.data });
        });

        var i = 0;
        _.each(revhistories, function (revisions) {      
            // _.each(revisions, function (revision) {
            //     //logic for getting blocked stories here
            //     // console.log('Revision: ', revision);
            //     if (revision.data.Description.includes(BLOCKED_START)) {
            //         console.log('Artifact: ' + promises[i].artifact.FormattedID + ' Revision ' + revision.data.RevisionNumber + ' blocked:' + revision.data.CreationDate);
            //         promises[i].revisions = revisions;
            //         i++;
            //     }
            // });
            promises[i].revisions = revisions;
            i++;
        });
        return Deft.Promise.all(promises);
    },
    _getBlockedItems: function (artifactsWithRevs) {
        var me = this;
        var i = 0;
        var blockedArtifacts = [];
        _.each(artifactsWithRevs, function (artifactWithRev) {
            var blockedTime = 0;
            var artifactFormattedId = artifactWithRev.artifact.FormattedID;
            var artifactRevisions = artifactWithRev.revisions;
            if (artifactRevisions != undefined) {
                _.each(artifactRevisions, function (revision) {
                    //Get total time blocked for ALL revisions
                    var revisionDescription = revision.data.Description;

                    if (revisionDescription.includes(BLOCKED_START)) {
                        // var blockedFor = me._getTotalHoursBlocked(artifactWithRev);
                        // blockedTime += blockedFor;
                        blockedTime = me._getTotalHoursBlocked(artifactWithRev);

                    }
                    
                });
                if (blockedTime > 0) {
                    console.log('Blocked artifact: ', artifactFormattedId);
                        console.log('Blocked for: ', blockedTime);
                        artifactWithRev.blockedHours = blockedTime;
                        blockedArtifacts.push(artifactWithRev);
                }
                // console.log('Blocked artifact: ', artifactFormattedId);
                //         console.log('Blocked for: ', blockedTime);
                //         artifactWithRev.blockedHours = blockedTime;
                //         blockedArtifacts.push(artifactWithRev);
            }      
            
        });
        return blockedArtifacts;
    },
    _addReleaseCombo: function () {
        console.log('Adding Release combo box');
        var me = this;
        me.add(
            {
                xtype: 'rallyreleasecombobox',
                itemId: 'release-combobox',
                fieldLabel: 'Release',
                labelAlign: 'right',
                //  listeners: {
                //      ready: me._makeGrid,
                //      scope: me
                //  }
            }
        );
        
    },
    _getFilters: function (releaseValue) {

        var releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
            property: 'Release',
            value: releaseValue
        });
        // return iterationFilter.and(severityFilter);
        return releaseFilter;
    },
    _getHoursBlocked: function (start, end) {
        const milliseconds = Math.abs(new Date(end) - new Date(start));
        const hours = milliseconds / 36e5;
        return hours;

        // return Rally.util.DateTime.getDifference(end, start, 'hour');
    },
    _getTotalHoursBlocked: function (revisions) {
        // console.log('_getTotalHoursBlocked for ', revisions.artifact.FormattedID);
        var me = this;
        var revs = revisions.revisions;
        var totalHoursBlocked = 0;
        var endBlocked = 0;
        var startBlocked = 0;
        revs.forEach(rev => {
            // if (rev.data.Description.includes(BLOCKED_START)) {
            //     startBlocked = rev.data.CreationDate;
            //     totalHoursBlocked += me._getHoursBlocked(startBlocked, endBlocked);
            //     console.log('totalHoursBlocked ', totalHoursBlocked);
            // }
            // else if (rev.data.Description.includes(BLOCKED_END)) {
            //     endBlocked = rev.data.CreationDate;
            // }
            // console.log('Inner total hours blocked ' + totalHoursBlocked.toFixed(0));
            // return totalHoursBlocked.toFixed(0);
            var revHoursBlocked = parseInt(me._getRevHoursBlocked(rev));
            totalHoursBlocked += revHoursBlocked;
        });
        // console.log('Total hours blocked all revisions: ', totalHoursBlocked);
        return totalHoursBlocked;
    },
    _getRevHoursBlocked: function (rev) {
        // console.log('_getRevHoursBlocked for ', rev.data.RevisionNumber);
        var me = this;
        // var startBlocked = 0;
        // var endBlocked = 0;
        var revHoursBlocked = 0;
        if (rev.data.Description.includes(BLOCKED_START)) {
            startBlocked = rev.data.CreationDate;
            revHoursBlocked += me._getHoursBlocked(startBlocked, endBlocked);
        }
        else if (rev.data.Description.includes(BLOCKED_END)) {
            endBlocked = rev.data.CreationDate;
        }
        // if (revHoursBlocked >0) {
        //     console.log('Rev ' + rev.data.RevisionNumber + ': hours blocked ' + revHoursBlocked.toFixed(0));
        // }
        return revHoursBlocked.toFixed(0);
        
    },
    _makeGrid: function(artifactsWithRevs){
    //   console.log('Artifacts with Revs: ', artifactsWithRevs);
      var me = this;

        this.add({
            xtype: 'rallygrid',
            showPagingToolbar: true,
            showRowActionsColumn: false,
            editable: false,
            store: Ext.create('Rally.data.custom.Store', {
                data: artifactsWithRevs
            }),
            columnCfgs: [
                {
                    text: 'FormattedID', dataIndex: 'artifact', 
                      renderer:function(value){
                        return '<a href="https://rally1.rallydev.com/#/detail/userstory/' + value.ObjectID + '" target="_blank">' + value.FormattedID + '</a>';
                    }
                },
                {
                    text: 'Name', dataIndex: 'artifact', 
                      renderer:function(artifact){
                        return artifact.Name;
                    }
                },
                {
                    text: 'Hours blocked', dataIndex: 'blockedHours',
                    renderer: function (artifact) {
                        return artifact;
                    }
                },
            ]
        });
        
    }
    
});

